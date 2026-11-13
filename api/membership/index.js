import { sql, json, requireAdmin, audit } from "./_db.js";

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const rows = await sql`
        SELECT *
        FROM membership_plans
        WHERE active = TRUE
        ORDER BY price ASC
      `;

      return json(res, 200, {
        success: true,
        memberships: rows
      });
    }

    const admin = await requireAdmin(req, res);
    if (!admin) return;

    if (req.method === "POST") {
      const b = req.body || {};

      if (!b.title?.trim()) {
        return json(res, 400, {
          success: false,
          message: "Membership title required."
        });
      }

      const rows = await sql`
        INSERT INTO membership_plans
          (name, description, price, duration_days)
        VALUES (
          ${b.title.trim()},
          ${b.description || ""},
          ${Number(b.price) || 0},
          ${Number(b.duration) || 30}
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
        membership: rows[0]
      });
    }

    if (req.method === "DELETE") {
      const { id } = req.body || {};

      if (!id) {
        return json(res, 400, {
          success: false,
          message: "Membership id is required."
        });
      }

      await sql`
        UPDATE membership_plans
        SET active = FALSE
        WHERE id = ${id}
      `;

      await audit(
        admin.id,
        "membership.archive",
        "membership_plan",
        id
      );

      return json(res, 200, { success: true });
    }

    res.setHeader("Allow", "GET, POST, DELETE");

    return json(res, 405, {
      success: false,
      message: "Method not allowed."
    });
  } catch (e) {
    console.error(e);

    return json(res, 500, {
      success: false,
      message: "Membership operation failed."
    });
  }
}
