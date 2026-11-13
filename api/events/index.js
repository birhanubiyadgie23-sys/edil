import {
  sql,
  json,
  requireAdmin,
  audit
} from "../_db.js";

export default async function handler(req, res) {
  try {
    // ==============================
    // GET EVENTS
    // Public: /api/events
    // Admin:  /api/events?admin=1
    // ==============================

    if (req.method === "GET") {
      const isAdminRequest = req.query?.admin === "1";

      if (isAdminRequest) {
        const admin = await requireAdmin(req, res);
        if (!admin) return;

        const events = await sql`
          SELECT
            id,
            title,
            description,
            event_date,
            location,
            image_url,
            active,
            CASE
              WHEN active = TRUE THEN 'published'
              ELSE 'draft'
            END AS status,
            created_at,
            updated_at
          FROM events
          ORDER BY event_date ASC NULLS LAST
        `;

        return json(res, 200, {
          success: true,
          events
        });
      }

      // Public visitors see active events only.
      const events = await sql`
        SELECT
          id,
          title,
          description,
          event_date,
          location,
          image_url,
          active,
          created_at
        FROM events
        WHERE active = TRUE
        ORDER BY event_date ASC NULLS LAST
      `;

      return json(res, 200, {
        success: true,
        events
      });
    }

    // ==============================
    // ALLOW ADMIN OPERATIONS ONLY
    // ==============================

    if (!["POST", "DELETE"].includes(req.method)) {
      res.setHeader("Allow", "GET, POST, DELETE");

      return json(res, 405, {
        success: false,
        message: "Method not allowed."
      });
    }

    const admin = await requireAdmin(req, res);
    if (!admin) return;

    // ==============================
    // CREATE EVENT
    // ==============================

    if (req.method === "POST") {
      const b = req.body || {};

      const title = String(b.title || "").trim();

      if (!title) {
        return json(res, 400, {
          success: false,
          message: "Event title is required."
        });
      }

      const description = String(b.description || "");
      const location = String(b.location || "").trim();

      const imageUrl = b.image_url
        ? String(b.image_url).trim()
        : null;

      let eventDate = null;

      if (b.event_date) {
        const parsedDate = new Date(b.event_date);

        if (Number.isNaN(parsedDate.getTime())) {
          return json(res, 400, {
            success: false,
            message: "Invalid event date."
          });
        }

        eventDate = parsedDate;
      }

      if (
        b.status !== undefined &&
        !["draft", "published"].includes(b.status)
      ) {
        return json(res, 400, {
          success: false,
          message: "Invalid event status."
        });
      }

      const active = b.status !== "draft";

      const rows = await sql`
        INSERT INTO events (
          title,
          description,
          event_date,
          location,
          image_url,
          active
        )
        VALUES (
          ${title},
          ${description},
          ${eventDate},
          ${location},
          ${imageUrl},
          ${active}
        )
        RETURNING *
      `;

      await audit(
        admin.id,
        "event.create",
        "event",
        rows[0].id
      );

      return json(res, 201, {
        success: true,
        event: {
          ...rows[0],
          status: rows[0].active ? "published" : "draft"
        }
      });
    }

    // ==============================
    // ARCHIVE EVENT
    // ==============================

    if (req.method === "DELETE") {
      const id = Number(req.body?.id);

      if (!Number.isSafeInteger(id) || id < 1) {
        return json(res, 400, {
          success: false,
          message: "A valid event ID is required."
        });
      }

      const rows = await sql`
        UPDATE events
        SET
          active = FALSE,
          updated_at = NOW()
        WHERE id = ${id}
        RETURNING id
      `;

      if (!rows.length) {
        return json(res, 404, {
          success: false,
          message: "Event not found."
        });
      }

      await audit(
        admin.id,
        "event.archive",
        "event",
        id
      );

      return json(res, 200, {
        success: true,
        message: "Event archived successfully."
      });
    }

  } catch (error) {
    console.error("Events API error:", error);

    return json(res, 500, {
      success: false,
      message: "Event operation failed."
    });
  }
}
