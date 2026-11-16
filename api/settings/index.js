
import {
  sql,
  json,
  requireSuperAdmin,
  audit
} from "../_db.js";

// ==========================================
// SETTINGS ALLOWLIST
// ==========================================

const ALLOWED_SETTINGS = [
  // General
  "site_title",
  "site_tagline",
  "logo_url",
  "favicon_url",
  "site_description",
  "default_language",
  "currency",
  "timezone",

  // Homepage
  "hero_title",
  "hero_subtitle",
  "hero_image_url",
  "hero_video_url",
  "hero_primary_button_text",
  "hero_primary_button_url",
  "hero_secondary_button_text",
  "hero_secondary_button_url",

  // Appearance
  "primary_color",
  "secondary_color",
  "accent_color",
  "background_color",
  "text_color",
  "font_heading",
  "font_body",
  "theme_mode",

  // Dynamic content
  "social_links",
  "contact_methods",
  "navigation_items",
  "homepage_sections",
  "topics",
  "features",

  // Footer and SEO
  "footer_settings",
  "seo_settings",

  // Announcement
  "announcement_bar",

  // Affiliate
  "affiliate_disclosure",
  "affiliate_enabled",
  "affiliate_marketplace",

  // Availability
  "maintenance_mode"
];

const ARRAY_SETTINGS = [
  "social_links",
  "contact_methods",
  "navigation_items",
  "homepage_sections",
  "topics",
  "features"
];

const OBJECT_SETTINGS = [
  "footer_settings",
  "seo_settings",
  "announcement_bar"
];

const BOOLEAN_SETTINGS = [
  "affiliate_enabled",
  "maintenance_mode"
];

// ==========================================
// PUBLIC SETTINGS
// ==========================================

const PUBLIC_SETTINGS = [
  ...ALLOWED_SETTINGS
];

// ==========================================
// VALUE PARSER
// ==========================================

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

// ==========================================
// VALIDATION
// ==========================================

function validateSetting(key, value) {
  if (ARRAY_SETTINGS.includes(key)) {
    return Array.isArray(value) && value.length <= 500;
  }

  if (OBJECT_SETTINGS.includes(key)) {
    return (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value)
    );
  }

  if (BOOLEAN_SETTINGS.includes(key)) {
    return typeof value === "boolean";
  }

  return (
    typeof value === "string" ||
    typeof value === "number"
  );
}

// ==========================================
// GET SETTINGS
// ==========================================

async function getSettings(req, res) {
  const isAdmin = req.query?.admin === "1";

  if (isAdmin) {
    const admin = await requireSuperAdmin(req, res);

    if (!admin) return;

    const rows = await sql`
      SELECT key, value, updated_at
      FROM settings
      ORDER BY key ASC
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

  const rows = await sql`
    SELECT key, value
    FROM settings
  `;

  const settings = Object.fromEntries(
    rows
      .filter(row => PUBLIC_SETTINGS.includes(row.key))
      .map(row => [
        row.key,
        parseSettingValue(row.value)
      ])
  );

  return json(res, 200, {
    success: true,
    settings
  });
}

// ==========================================
// UPDATE SETTINGS
// ==========================================

async function updateSettings(req, res) {
  const admin = await requireSuperAdmin(req, res);

  if (!admin) return;

  const { settings } = req.body || {};

  if (
    !settings ||
    typeof settings !== "object" ||
    Array.isArray(settings)
  ) {
    return json(res, 400, {
      success: false,
      message: "A valid settings object is required."
    });
  }

  const entries = Object.entries(settings);

  if (!entries.length) {
    return json(res, 400, {
      success: false,
      message: "No settings supplied."
    });
  }

  if (entries.length > ALLOWED_SETTINGS.length) {
    return json(res, 400, {
      success: false,
      message: "Too many settings supplied."
    });
  }

  // Validate every setting before saving anything.
  for (const [key, value] of entries) {
    if (!ALLOWED_SETTINGS.includes(key)) {
      return json(res, 400, {
        success: false,
        message: `Setting "${key}" is not allowed.`
      });
    }

    if (!validateSetting(key, value)) {
      return json(res, 400, {
        success: false,
        message: `Invalid value for setting "${key}".`
      });
    }

    let serialized;

    try {
      serialized = JSON.stringify(value);
    } catch {
      return json(res, 400, {
        success: false,
        message: `Could not serialize setting "${key}".`
      });
    }

    if (
      serialized === undefined ||
      serialized.length > 100000
    ) {
      return json(res, 400, {
        success: false,
        message: `Setting "${key}" is too large or invalid.`
      });
    }
  }

  // Save settings using the existing key/value table.
  for (const [key, value] of entries) {
    const serialized = JSON.stringify(value);

    await sql`
      INSERT INTO settings (key, value, updated_at)
      VALUES (${key}, ${serialized}, NOW())
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
    message: "Settings saved successfully.",
    updated: entries.length
  });
}

// ==========================================
// MAIN HANDLER
// ==========================================

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      return await getSettings(req, res);
    }

    if (req.method === "PUT") {
      return await updateSettings(req, res);
    }

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
