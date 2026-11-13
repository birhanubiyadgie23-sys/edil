import {
  sql,
  json,
  requireAdmin,
  audit
} from "../_db.js";

export default async function handler(req, res) {
  try {
    // ==============================
    // GET MEMBERSHIP PLANS
    // Public: /api/membership
    // Admin:  /api/membership?admin=1
    // ==============================

    if (req.method === "GET") {
      const isAdminRequest = req.query?.admin === "1";

      if (isAdminRequest) {
        const admin = await requireAdmin(req, res);
        if (!admin) return;

        const memberships = await sql`
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
          ORDER BY price ASC
        `;

        return json(res, 200, {
          success: true,
          memberships
        });
      }

      const memberships = await sql`
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
        ORDER BY price ASC
      `;

      return json(res, 200, {
        success: true,
        memberships
      });
    }

    // ==============================
    // CHECK ALLOWED METHODS
    // ==============================

    if (!["POST", "DELETE"].includes(req.method)) {
      res.setHeader("Allow", "GET, POST, DELETE");

      return json(res, 405, {
        success: false,
        message: "Method not allowed."
      });
    }

    // ==============================
    // ADMIN AUTHENTICATION
    // ==============================

    const admin = await requireAdmin(req, res);
    if (!admin) return;

    // ==============================
    // CREATE MEMBERSHIP PLAN
    // ==============================

    if (req.method === "POST") {
      const b = req.body || {};

      const name = String(
        b.name || b.title || ""
      ).trim();

      const description = String(
        b.description || ""
      ).trim();

      if (!name) {
        return json(res, 400, {
          success: false,
          message: "Membership name is required."
        });
      }

      const price = b.price === undefined
        ? 0
        : Number(b.price);

      const durationDays = b.duration_days === undefined
        ? (b.duration === undefined ? 30 : Number(b.duration))
        : Number(b.duration_days);

      if (
        !Number.isFinite(price) ||
        price < 0
      ) {
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
          ${JSON.stringify(features)},
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

    // ==============================
    // ARCHIVE MEMBERSHIP PLAN
    // ==============================

    if (req.method === "DELETE") {
      const id = Number(req.body?.id);

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
