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

// ==========================================
// VALUE TYPES
// ==========================================

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

// Only settings intended for public website display.
// Never add passwords, API keys, tokens or private credentials here.

const PUBLIC_SETTINGS = [
  "site_title",
  "site_tagline",
  "logo_url",
  "favicon_url",
  "site_description",
  "default_language",
  "currency",
  "timezone",

  "hero_title",
  "hero_subtitle",
  "hero_image_url",
  "hero_video_url",
  "hero_primary_button_text",
  "hero_primary_button_url",
  "hero_secondary_button_text",
  "hero_secondary_button_url",

  "primary_color",
  "secondary_color",
  "accent_color",
  "background_color",
  "text_color",
  "font_heading",
  "font_body",
  "theme_mode",

  "social_links",
  "contact_methods",
  "navigation_items",
  "homepage_sections",
  "topics",
  "features",

  "footer_settings",
  "seo_settings",
  "announcement_bar",

  "affiliate_disclosure",
  "affiliate_enabled",
  "affiliate_marketplace",
  "maintenance_mode"
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
    // Support older settings stored as plain text.
    return value;
  }
}

// ==========================================
// VALIDATION
// ==========================================

function validateSetting(key, value) {
  if (!ALLOWED_SETTINGS.includes(key)) {
    return false;
  }

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

  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  return typeof value === "string";
}

// ==========================================
// SERIALIZATION VALIDATION
// ==========================================

function serializeSetting(key, value) {
  let serialized;

  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new Error(`Could not serialize setting "${key}".`);
  }

  if (
    serialized === undefined ||
    serialized.length > 100000
  ) {
    throw new Error(
      `Setting "${key}" is too large or invalid.`
    );
  }

  return serialized;
}

// ==========================================
// GET SETTINGS
// ==========================================

async function getSettings(req, res) {
  const isAdmin = req.query?.admin === "1";

  // ADMIN SETTINGS
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

  // PUBLIC SETTINGS
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

  // Validate ALL settings before saving any of them.
  const validatedEntries = [];

  for (const [key, value] of entries) {
    if (!validateSetting(key, value)) {
      return json(res, 400, {
        success: false,
        message: `Invalid value for setting "${key}".`
      });
    }

    let serialized;

    try {
      serialized = serializeSetting(key, value);
    } catch (error) {
      return json(res, 400, {
        success: false,
        message: error.message
      });
    }

    validatedEntries.push({
      key,
      serialized
    });
  }

  // Save validated settings.
  for (const item of validatedEntries) {
    await sql`
      INSERT INTO settings (
        key,
        value,
        updated_at
      )
      VALUES (
        ${item.key},
        ${item.serialized},
        NOW()
      )
      ON CONFLICT (key)
      DO UPDATE SET
        value = EXCLUDED.value,
        updated_at = NOW()
    `;
  }

  // AUDIT LOG
  await audit(
    admin.id,
    "settings.update",
    "settings",
    null,
    {
      keys: validatedEntries.map(item => item.key)
    }
  );

  return json(res, 200, {
    success: true,
    message: "Settings saved successfully.",
    updated: validatedEntries.length
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
