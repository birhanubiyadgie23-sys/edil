
import {
  sql,
  json,
  method,
  requireUser,
  requireAdmin,
  requireSuperAdmin,
  audit
} from "../_db.js";

// ==========================================
// HELPERS
// ==========================================

function validId(value) {
  const id = String(value ?? "").trim();

  return /^\d+$/.test(id) && id !== "0"
    ? id
    : null;
}

function paymentMethodLabel(value) {
  return value === "telebirr"
    ? "Telebirr"
    : value === "bank"
      ? "Bank Transfer"
      : value;
}

// ==========================================
// MEMBERSHIP API
// ==========================================

export default async function handler(req, res) {
  if (!method(req, res, ["GET", "POST", "PATCH", "DELETE"])) {
    return;
  }

  try {
    const action = String(req.query?.admin || "");

    // ========================================
    // GET MEMBERSHIP PLANS
    // ========================================

    if (req.method === "GET" && action !== "payments") {
      const isAdminRequest = action === "1";

      if (isAdminRequest) {
        const admin = await requireAdmin(req, res);
        if (!admin) return;
      }

      const memberships = isAdminRequest
        ? await sql`
            SELECT
              id,
              name,
              description,
              price,
              duration_days,
              features,
              active,
              created_at
            FROM membership_plans
            ORDER BY price ASC, id ASC
          `
        : await sql`
            SELECT
              id,
              name,
              description,
              price,
              duration_days,
              features,
              active,
              created_at
            FROM membership_plans
            WHERE active = TRUE
            ORDER BY price ASC, id ASC
          `;

      return json(res, 200, {
        success: true,
        memberships
      });
    }

    // ========================================
    // ADMIN: LIST PAYMENT REQUESTS
    // ========================================

    if (req.method === "GET" && action === "payments") {
      const admin = await requireSuperAdmin(req, res);
      if (!admin) return;

      const payments = await sql`
        SELECT
          um.id,
          um.user_id,
          um.plan_id,
          um.status,
          um.payment_method,
          um.payment_reference,
          um.created_at,
          um.reviewed_at,
          um.admin_note,

          mp.name AS plan_name,
          mp.price AS plan_price,
          mp.duration_days,

          u.name AS user_name,
          u.email AS user_email

        FROM user_memberships um

        INNER JOIN membership_plans mp
          ON mp.id = um.plan_id

        INNER JOIN users u
          ON u.id = um.user_id

        WHERE um.payment_method IS NOT NULL

        ORDER BY
          CASE
            WHEN um.status = 'pending' THEN 0
            ELSE 1
          END,
          um.created_at DESC
      `;

      return json(res, 200, {
        success: true,
        payments: payments.map(payment => ({
          ...payment,
          payment_method_label: paymentMethodLabel(
            payment.payment_method
          )
        }))
      });
    }

    // ========================================
    // USER: CREATE MEMBERSHIP REQUEST
    // ========================================

    if (req.method === "POST" && req.body?.plan_id !== undefined) {
      const user = await requireUser(req, res);
      if (!user) return;

      const planId = validId(req.body.plan_id);

      if (!planId) {
        return json(res, 400, {
          success: false,
          message: "Valid membership plan is required."
        });
      }

      const plans = await sql`
        SELECT
          id,
          name,
          price,
          duration_days,
          active
        FROM membership_plans
        WHERE id = ${planId}
          AND active = TRUE
        LIMIT 1
      `;

      if (!plans.length) {
        return json(res, 404, {
          success: false,
          message: "Membership plan not found or unavailable."
        });
      }

      const plan = plans[0];
      const price = Number(plan.price);
      const durationDays = Number(plan.duration_days);

      if (
        !Number.isFinite(price) ||
        price < 0 ||
        !Number.isSafeInteger(durationDays) ||
        durationDays < 1
      ) {
        return json(res, 500, {
          success: false,
          message: "Membership plan configuration is invalid."
        });
      }

      // --------------------------------------
      // FREE MEMBERSHIP
      // --------------------------------------

      if (price === 0) {
        const existing = await sql`
          SELECT id
          FROM user_memberships
          WHERE user_id = ${user.id}
            AND status = 'active'
            AND expires_at > NOW()
          LIMIT 1
        `;

        if (existing.length) {
          return json(res, 409, {
            success: false,
            message: "You already have an active membership."
          });
        }

        const created = await sql`
          INSERT INTO user_memberships (
            user_id,
            plan_id,
            status,
            starts_at,
            expires_at
          )
          VALUES (
            ${user.id},
            ${plan.id},
            'active',
            NOW(),
            NOW() + (${durationDays} * INTERVAL '1 day')
          )
          RETURNING *
        `;

        await audit(
          user.id,
          "membership.activate_free",
          "user_membership",
          created[0].id,
          {
            plan_id: plan.id,
            plan_name: plan.name
          }
        );

        return json(res, 201, {
          success: true,
          membership: created[0],
          message: "Free membership activated successfully."
        });
      }

      // --------------------------------------
      // PAID MEMBERSHIP
      // --------------------------------------

      const paymentMethod = String(
        req.body.payment_method || ""
      ).trim().toLowerCase();

      const paymentReference = String(
        req.body.payment_reference || ""
      ).trim();

      if (!["telebirr", "bank"].includes(paymentMethod)) {
        return json(res, 400, {
          success: false,
          message: "Choose Telebirr or Bank Transfer."
        });
      }

      if (
        paymentReference.length < 3 ||
        paymentReference.length > 150
      ) {
        return json(res, 400, {
          success: false,
          message: "Enter a valid payment reference."
        });
      }

      const existingPending = await sql`
        SELECT id
        FROM user_memberships
        WHERE user_id = ${user.id}
          AND plan_id = ${plan.id}
          AND status = 'pending'
          AND payment_method IS NOT NULL
        LIMIT 1
      `;

      if (existingPending.length) {
        return json(res, 409, {
          success: false,
          message: "You already have a pending payment request for this plan."
        });
      }

      const existingActive = await sql`
        SELECT id
        FROM user_memberships
        WHERE user_id = ${user.id}
          AND status = 'active'
          AND expires_at > NOW()
        LIMIT 1
      `;

      if (existingActive.length) {
        return json(res, 409, {
          success: false,
          message: "You already have an active membership."
        });
      }

      const created = await sql`
        INSERT INTO user_memberships (
          user_id,
          plan_id,
          status,
          payment_method,
          payment_reference
        )
        VALUES (
          ${user.id},
          ${plan.id},
          'pending',
          ${paymentMethod},
          ${paymentReference}
        )
        RETURNING *
      `;

      await audit(
        user.id,
        "membership.payment_submitted",
        "user_membership",
        created[0].id,
        {
          plan_id: plan.id,
          payment_method: paymentMethod
        }
      );

      return json(res, 201, {
        success: true,
        membership: created[0],
        message: "Payment submitted. Your membership will activate after admin verification."
      });
    }

    // ========================================
    // ADMIN: APPROVE OR REJECT PAYMENT
    // ========================================

    if (req.method === "PATCH") {
      const admin = await requireSuperAdmin(req, res);
      if (!admin) return;

      const body = req.body || {};
      const id = validId(body.id);
      const decision = String(body.decision || "")
        .trim()
        .toLowerCase();

      const adminNote = String(
        body.admin_note || ""
      ).trim();

      if (!id || !["approve", "reject"].includes(decision)) {
        return json(res, 400, {
          success: false,
          message: "Valid payment ID and decision are required."
        });
      }

      if (decision === "reject" && !adminNote) {
        return json(res, 400, {
          success: false,
          message: "A reason is required when rejecting a payment."
        });
      }

      if (adminNote.length > 2000) {
        return json(res, 400, {
          success: false,
          message: "Admin note is too long."
        });
      }

      // --------------------------------------
      // APPROVE PAYMENT
      // --------------------------------------

      if (decision === "approve") {
        const updated = await sql`
          UPDATE user_memberships AS um
          SET
            status = 'active',
            starts_at = NOW(),
            expires_at = NOW() +
              (mp.duration_days * INTERVAL '1 day'),
            reviewed_at = NOW(),
            admin_note = ${adminNote || null}

          FROM membership_plans AS mp

          WHERE um.id = ${id}
            AND um.plan_id = mp.id
            AND um.status = 'pending'
            AND um.payment_method IS NOT NULL
            AND mp.price > 0

          RETURNING
            um.id,
            um.user_id,
            um.plan_id,
            um.status,
            um.starts_at,
            um.expires_at,
            um.reviewed_at
        `;

        if (!updated.length) {
          return json(res, 409, {
            success: false,
            message: "Payment request not found or already reviewed."
          });
        }

        await audit(
          admin.id,
          "membership.payment_approved",
          "user_membership",
          id,
          {
            user_id: updated[0].user_id,
            plan_id: updated[0].plan_id
          }
        );

        return json(res, 200, {
          success: true,
          membership: updated[0],
          message: "Payment approved. Membership activated successfully."
        });
      }

      // --------------------------------------
      // REJECT PAYMENT
      // --------------------------------------

      const updated = await sql`
        UPDATE user_memberships
        SET
          status = 'cancelled',
          reviewed_at = NOW(),
          admin_note = ${adminNote}
        WHERE id = ${id}
          AND status = 'pending'
          AND payment_method IS NOT NULL
        RETURNING id, user_id, plan_id, status, reviewed_at
      `;

      if (!updated.length) {
        return json(res, 409, {
          success: false,
          message: "Payment request not found or already reviewed."
        });
      }

      await audit(
        admin.id,
        "membership.payment_rejected",
        "user_membership",
        id,
        {
          user_id: updated[0].user_id,
          plan_id: updated[0].plan_id,
          admin_note: adminNote
        }
      );

      return json(res, 200, {
        success: true,
        membership: updated[0],
        message: "Payment rejected."
      });
    }

    // ========================================
    // ADMIN: CREATE MEMBERSHIP PLAN
    // ========================================

    if (req.method === "POST") {
      const admin = await requireAdmin(req, res);
      if (!admin) return;

      const body = req.body || {};

      const name = String(
        body.name || body.title || ""
      ).trim();

      const description = String(
        body.description || ""
      ).trim();

      if (!name) {
        return json(res, 400, {
          success: false,
          message: "Membership name is required."
        });
      }

      const price = body.price === undefined || body.price === ""
        ? 0
        : Number(body.price);

      const durationValue = body.duration_days !== undefined
        ? body.duration_days
        : (
            body.duration !== undefined
              ? body.duration
              : 30
          );

      const durationDays = Number(durationValue);

      if (!Number.isFinite(price) || price < 0) {
        return json(res, 400, {
          success: false,
          message: "Membership price must be a valid non-negative number."
        });
      }

      if (
        !Number.isSafeInteger(durationDays) ||
        durationDays < 1
      ) {
        return json(res, 400, {
          success: false,
          message: "Membership duration must be a positive whole number of days."
        });
      }

      let features = [];

      if (body.features !== undefined) {
        if (
          !Array.isArray(body.features) ||
          !body.features.every(
            item => typeof item === "string"
          )
        ) {
          return json(res, 400, {
            success: false,
            message: "Features must be an array of text values."
          });
        }

        features = body.features
          .map(item => item.trim())
          .filter(Boolean);
      }

      const rows = await sql`
        INSERT INTO membership_plans (
          name,
          description,
          price,
          duration_days,
          features,
          active
        )
        VALUES (
          ${name},
          ${description},
          ${price},
          ${durationDays},
          ${JSON.stringify(features)}::jsonb,
          TRUE
        )
        RETURNING *
      `;

      await audit(
        admin.id,
        "membership.create",
        "membership_plan",
        rows[0].id
      );

      return json(res, 201, {
        success: true,
        membership: rows[0],
        message: "Membership plan created successfully."
      });
    }

    // ========================================
    // ADMIN: ARCHIVE MEMBERSHIP PLAN
    // ========================================

    if (req.method === "DELETE") {
      const admin = await requireAdmin(req, res);
      if (!admin) return;

      const id = validId(req.body?.id);

      if (!id) {
        return json(res, 400, {
          success: false,
          message: "A valid membership ID is required."
        });
      }

      const rows = await sql`
        UPDATE membership_plans
        SET active = FALSE
        WHERE id = ${id}
        RETURNING id
      `;

      if (!rows.length) {
        return json(res, 404, {
          success: false,
          message: "Membership plan not found."
        });
      }

      await audit(
        admin.id,
        "membership.archive",
        "membership_plan",
        id
      );

      return json(res, 200, {
        success: true,
        message: "Membership plan archived successfully."
      });
    }

    return json(res, 405, {
      success: false,
      message: "Unsupported membership operation."
    });

  } catch (error) {
    console.error("Membership API error:", error);

    return json(res, 500, {
      success: false,
      message: "Membership operation failed."
    });
  }
}
