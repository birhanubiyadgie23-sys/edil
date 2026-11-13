
import {
  sql,
  json,
  requireAdmin,
  audit
} from "./_db.js";

// Only these settings are exposed to public website visitors.
const ALLOWED_SETTINGS = [
  "site_title",
  "hero_title"
];

// Read JSON values safely.
// Also supports older plain-text values already stored in the database.
function parseSettingValue(value) {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export default async function handler(req, res) {
  try {
    // ==============================
    // GET PUBLIC SETTINGS
    // GET /api/settings
    // ==============================

    if (req.method === "GET") {
      const rows = await sql`
        SELECT key, value
        FROM settings
        WHERE key IN ('site_title', 'hero_title')
      `;

      const settings = Object.fromEntries(
        rows.map(row => [
          row.key,
          parseSettingValue(row.value)
        ])
      );

      return json(res, 200, {
        success: true,
        settings
      });
    }

    // ==============================
    // UPDATE SETTINGS
    // PUT /api/settings
    // ==============================

    if (req.method === "PUT") {
      const admin = await requireAdmin(req, res);
      if (!admin) return;

      const { settings } = req.body || {};

      if (
        !settings ||
        typeof settings !== "object" ||
        Array.isArray(settings)
      ) {
        return json(res, 400, {
          success: false,
          message: "Settings object required."
        });
      }

      const entries = Object.entries(settings);

      if (!entries.length) {
        return json(res, 400, {
          success: false,
          message: "No settings supplied."
        });
      }

      // Reject settings that are not on the allowed list.
      for (const [key] of entries) {
        if (!ALLOWED_SETTINGS.includes(key)) {
          return json(res, 400, {
            success: false,
            message: `Setting "${key}" is not allowed.`
          });
        }
      }

      // Save each setting.
      for (const [key, value] of entries) {
        let serializedValue;

        try {
          serializedValue = JSON.stringify(value);
        } catch {
          return json(res, 400, {
            success: false,
            message: `Invalid value for setting "${key}".`
          });
        }

        if (serializedValue === undefined) {
          return json(res, 400, {
            success: false,
            message: `Invalid value for setting "${key}".`
          });
        }

        await sql`
          INSERT INTO settings (key, value)
          VALUES (${key}, ${serializedValue})
          ON CONFLICT (key)
          DO UPDATE SET
            value = EXCLUDED.value,
            updated_at = NOW()
        `;
      }

      await audit(
        admin.id,
        "settings.update",
        "settings",
        null,
        {
          keys: entries.map(([key]) => key)
        }
      );

      return json(res, 200, {
        success: true,
        message: "Settings saved successfully."
      });
    }

    // ==============================
    // INVALID METHOD
    // ==============================

    res.setHeader("Allow", "GET, PUT");

    return json(res, 405, {
      success: false,
      message: "Method not allowed."
    });

  } catch (error) {
    console.error("Settings API error:", error);

    return json(res, 500, {
      success: false,
      message: "Settings operation failed."
    });
  }
}
