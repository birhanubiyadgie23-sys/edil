
import {
  sql,
  json,
  method,
  requireUser,
  requireAdmin,
  audit
} from "../_db.js";

export default async function handler(req, res) {
  if (!method(req, res, ["GET", "POST", "PATCH", "DELETE"])) {
    return;
  }

  try {
    const b = req.body || {};

    // ==========================================
    // GET: MEMBERSHIP PLANS / PAYMENT REQUESTS
    // ==========================================
    if (req.method === "GET") {
      const isAdmin = req.query?.admin === "1";
      const isPaymentList = req.query?.admin === "payments";

      if (isAdmin || isPaymentList) {
        const admin = await requireAdmin(req, res);
        if (!admin) return;
      }

      if (isPaymentList) {
        const requests = await sql`
          SELECT
            um.id,
            um.user_id,
            um.plan_id,
            um.status,
            um.payment_method,
            um.payment_reference,
            um.created_at,
            um.admin_note,
            u.name AS user_name,
            u.email AS user_email,
            mp.name AS plan_name,
            mp.price AS plan_price,
            mp.duration_days
          FROM user_memberships um
          JOIN users u ON u.id = um.user_id
          JOIN membership_plans mp ON mp.id = um.plan_id
          WHERE um.status = 'pending'
          ORDER BY um.created_at ASC
        `;

        return json(res, 200, {
          success: true,
          requests
        });
      }

      const memberships = isAdmin
        ? await sql`
            SELECT id, name, description, price,
                   duration_days, features, active, created_at
            FROM membership_plans
            ORDER BY price ASC
          `
        : await sql`
            SELECT id, name, description, price,
                   duration_days, features, active, created_at
            FROM membership_plans
            WHERE active = TRUE
            ORDER BY price ASC
          `;

      return json(res, 200, {
        success: true,
        memberships
      });
    }

    // ==========================================
    // POST: USER PURCHASE OR ADMIN CREATE PLAN
    // ==========================================
    if (req.method === "POST") {

      // USER MEMBERSHIP REQUEST
      if (b.plan_id !== undefined) {
        const user = await requireUser(req, res);
        if (!user) return;

        const planId = Number(b.plan_id);

        if (!Number.isSafeInteger(planId) || planId < 1) {
          return json(res, 400, {
            success: false,
            message: "Invalid membership plan."
          });
        }

        const plans = await sql`
          SELECT id, name, price, duration_days
          FROM membership_plans
          WHERE id = ${planId}
            AND active = TRUE
          LIMIT 1
        `;

        if (!plans.length) {
          return json(res, 404, {
            success: false,
            message: "Membership plan not found."
          });
        }

        const plan = plans[0];

        // FREE MEMBERSHIP: ACTIVATE IMMEDIATELY
        if (Number(plan.price) === 0) {
          const activeMembership = await sql`
            SELECT id
            FROM user_memberships
            WHERE user_id = ${user.id}
              AND status = 'active'
              AND expires_at > NOW()
            LIMIT 1
          `;

          if (activeMembership.length) {
            return json(res, 409, {
              success: false,
              message: "You already have an active membership."
            });
          }

          const rows = await sql`
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
              NOW() + (${Number(plan.duration_days)} * INTERVAL '1 day')
            )
            RETURNING id, status, starts_at, expires_at
          `;

          return json(res, 201, {
            success: true,
            membership: rows[0],
            message: "Free membership activated successfully."
          });
        }

        // PAID MEMBERSHIP: PAYMENT DETAILS REQUIRED
        const paymentMethod = String(
          b.payment_method || ""
        ).trim().toLowerCase();

        const paymentReference = String(
          b.payment_reference || ""
        ).trim();

        if (!["telebirr", "bank"].includes(paymentMethod)) {
          return json(res, 400, {
            success: false,
            message: "Choose Telebirr or Bank Transfer."
          });
        }

        if (
          !paymentReference ||
          paymentReference.length > 150
        ) {
          return json(res, 400, {
            success: false,
            message: "Enter a valid transaction reference."
          });
        }

        const existingRequest = await sql`
          SELECT id
          FROM user_memberships
          WHERE user_id = ${user.id}
            AND plan_id = ${plan.id}
            AND status = 'pending'
          LIMIT 1
        `;

        if (existingRequest.length) {
          return json(res, 409, {
            success: false,
            message: "You already have a pending payment request."
          });
        }

        const rows = await sql`
          INSERT INTO user_memberships (
            user_id,
            plan_id,
            status,
            starts_at,
            expires_at,
            payment_method,
            payment_reference
          )
          VALUES (
            ${user.id},
            ${plan.id},
            'pending',
            NOW(),
            NOW(),
            ${paymentMethod},
            ${paymentReference}
          )
          RETURNING id, status, payment_method,
                    payment_reference, created_at
        `;

        return json(res, 201, {
          success: true,
          request: rows[0],
          message: "Payment request submitted. Waiting for admin approval."
        });
      }

      // ADMIN: CREATE MEMBERSHIP PLAN
      const admin = await requireAdmin(req, res);
      if (!admin) return;

      const name = String(b.name || b.title || "").trim();
      const description = String(b.description || "").trim();
      const price = b.price === undefined || b.price === ""
        ? 0
        : Number(b.price);

      const durationDays = Number(
        b.duration_days ?? b.duration ?? 30
      );

      if (!name) {
        return json(res, 400, {
          success: false,
          message: "Membership name is required."
        });
      }

      if (!Number.isFinite(price) || price < 0) {
        return json(res, 400, {
          success: false,
          message: "Invalid membership price."
        });
      }

      if (!Number.isSafeInteger(durationDays) || durationDays < 1) {
        return json(res, 400, {
          success: false,
          message: "Invalid membership duration."
        });
      }

      let features = [];

      if (b.features !== undefined) {
        if (
          !Array.isArray(b.features) ||
          !b.features.every(item => typeof item === "string")
        ) {
          return json(res, 400, {
            success: false,
            message: "Features must be an array of text values."
          });
        }

        features = b.features
          .map(item => item.trim())
          .filter(Boolean);
      }

      const rows = await sql`
        INSERT INTO membership_plans (
          name, description, price,
          duration_days, features, active
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

    // ==========================================
    // PATCH: ADMIN APPROVE / REJECT PAYMENT
    // ==========================================
    if (req.method === "PATCH") {
      const admin = await requireAdmin(req, res);
      if (!admin) return;

      const requestId = Number(b.id);
      const decision = String(b.decision || "").toLowerCase();
      const adminNote = String(b.admin_note || "").trim();

      if (!Number.isSafeInteger(requestId) || requestId < 1) {
        return json(res, 400, {
          success: false,
          message: "Invalid payment request ID."
        });
      }

      if (!["approve", "reject"].includes(decision)) {
        return json(res, 400, {
          success: false,
          message: "Choose approve or reject."
        });
      }

      let rows;

      if (decision === "approve") {
        rows = await sql`
          UPDATE user_memberships AS um
          SET
            status = 'active',
            starts_at = NOW(),
            expires_at = NOW() + (
              mp.duration_days * INTERVAL '1 day'
            ),
            reviewed_at = NOW(),
            admin_note = ${adminNote}
          FROM membership_plans AS mp
          WHERE um.id = ${requestId}
            AND um.plan_id = mp.id
            AND um.status = 'pending'
          RETURNING um.id, um.user_id, um.plan_id,
                    um.status, um.starts_at, um.expires_at
        `;
      } else {
        rows = await sql`
          UPDATE user_memberships
          SET
            status = 'rejected',
            reviewed_at = NOW(),
            admin_note = ${adminNote}
          WHERE id = ${requestId}
            AND status = 'pending'
          RETURNING id, user_id, plan_id, status
        `;
      }

      if (!rows.length) {
        return json(res, 404, {
          success: false,
          message: "Pending payment request not found or already reviewed."
        });
      }

      await audit(
        admin.id,
        `membership.payment.${decision}`,
        "user_membership",
        requestId
      );

      return json(res, 200, {
        success: true,
        membership: rows[0],
        message: decision === "approve"
          ? "Payment approved. Membership activated."
          : "Payment rejected."
      });
    }

    // ==========================================
    // DELETE: ADMIN ARCHIVE PLAN
    // ==========================================
    if (req.method === "DELETE") {
      const admin = await requireAdmin(req, res);
      if (!admin) return;

      const id = Number(b.id);

      if (!Number.isSafeInteger(id) || id < 1) {
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

  } catch (error) {
    console.error("Membership API error:", error);

    return json(res, 500, {
      success: false,
      message: "Membership operation failed."
    });
  }
}
