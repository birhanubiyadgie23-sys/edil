
import {
  sql,
  json,
  method,
  requireAdmin,
  audit
} from "../_db.js";

export default async function handler(req, res) {
  if (!method(req, res, ["GET", "POST", "DELETE"])) {
    return;
  }

  try {
    // GET EVENTS
    if (req.method === "GET") {
      const isAdminRequest = req.query?.admin === "1";

      if (isAdminRequest) {
        const admin = await requireAdmin(req, res);
        if (!admin) return;
      }

      let events;

      if (isAdminRequest) {
        events = await sql`
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
      } else {
        events = await sql`
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
      }

      return json(res, 200, {
        success: true,
        events
      });
    }

    // ADMIN AUTHENTICATION
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const b = req.body || {};

    // CREATE EVENT
    if (req.method === "POST") {
      const title = String(b.title || "").trim();
      const description = String(b.description || "");
      const location = String(b.location || "").trim();

      const imageUrl = b.image_url
        ? String(b.image_url).trim()
        : null;

      if (!title) {
        return json(res, 400, {
          success: false,
          message: "Event title is required."
        });
      }

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

      const status = b.status || "published";

      if (!["draft", "published"].includes(status)) {
        return json(res, 400, {
          success: false,
          message: "Invalid event status."
        });
      }

      const active = status === "published";

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
          status: active ? "published" : "draft"
        },
        message: "Event created successfully."
      });
    }

    // ARCHIVE EVENT
    if (req.method === "DELETE") {
      const id = Number(b.id);

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
