import {
  sql,
  json,
  method,
  requireSuperAdmin,
  audit
} from "../_db.js";

// ==========================================
// ALLOWED SETTINGS
// ==========================================

const ALLOWED_SETTINGS = new Set([
  // General and branding
  "site_title",
  "site_tagline",
  "logo_url",
  "favicon_url",
  "site_description",
  "default_language",
  "currency",
  "timezone",

  // Homepage hero
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

  // Dynamic collections
  "social_links",
  "contact_methods",
  "navigation_items",
  "homepage_sections",
  "topics",
  "features",

  // Footer
  "footer_settings",

  // SEO
  "seo_settings",

  // Announcements
  "announcement_bar",

  // Affiliate public settings
  "affiliate_disclosure",
  "affiliate_enabled",
  "affiliate_marketplace",

  // Website status
  "maintenance_mode"
]);

// ==========================================
// PUBLIC SETTINGS
// ==========================================

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
// SETTINGS VALUE TYPES
// ==========================================

const ARRAY_SETTINGS = new Set([
  "social_links",
  "contact_methods",
  "navigation_items",
  "homepage_sections",
  "topics",
  "features"
]);

const OBJECT_SETTINGS = new Set([
  "footer_settings",
  "seo_settings",
  "announcement_bar"
]);

const BOOLEAN_SETTINGS = new Set([
  "affiliate_enabled",
  "maintenance_mode"
]);

// ==========================================
// SAFE JSON PARSER
// Supports old plain-text values too.
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
// VALIDATE SETTINGS
// ==========================================

function validateSetting(key, value) {
  if (!ALLOWED_SETTINGS.has(key)) {
    return `Setting "${key}" is not allowed.`;
  }

  if (value === undefined) {
    return `Invalid value for "${key}".`;
  }

  if (ARRAY_SETTINGS.has(key) && !Array.isArray(value)) {
    return `"${key}" must be an array.`;
  }

  if (
    OBJECT_SETTINGS.has(key) &&
    (
      value === null ||
      typeof value !== "object" ||
      Array.isArray(value)
    )
  ) {
    return `"${key}" must be an object.`;
  }

  if (
    BOOLEAN_SETTINGS.has(key) &&
    typeof value !== "boolean"
  ) {
    return `"${key}" must be true or false.`;
  }

  if (
    ["social_links", "contact_methods", "navigation_items",
     "homepage_sections", "topics", "features"].includes(key) &&
    value.length > 500
  ) {
    return `"${key}" cannot contain more than 500 items.`;
  }

  return null;
}

// ==========================================
// API HANDLER
// ==========================================

export default async function handler(req, res) {
  if (!method(req, res, ["GET", "PUT"])) {
    return;
  }

  try {
    // ======================================
    // ADMIN SETTINGS
    // GET /api/settings?admin=1
    // ======================================

    if (
      req.method === "GET" &&
      req.query?.admin === "1"
    ) {
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

    // ======================================
    // PUBLIC SETTINGS
    // GET /api/settings
    // ======================================

    if (req.method === "GET") {
      const rows = await sql`
        SELECT key, value
        FROM settings
        WHERE key IN (
          'site_title',
          'site_tagline',
          'logo_url',
          'favicon_url',
          'site_description',
          'default_language',
          'currency',
          'timezone',
          'hero_title',
          'hero_subtitle',
          'hero_image_url',
          'hero_video_url',
          'hero_primary_button_text',
          'hero_primary_button_url',
          'hero_secondary_button_text',
          'hero_secondary_button_url',
          'primary_color',
          'secondary_color',
          'accent_color',
          'background_color',
          'text_color',
          'font_heading',
          'font_body',
          'theme_mode',
          'social_links',
          'contact_methods',
          'navigation_items',
          'homepage_sections',
          'topics',
          'features',
          'footer_settings',
          'seo_settings',
          'announcement_bar',
          'affiliate_disclosure',
          'affiliate_enabled',
          'affiliate_marketplace',
          'maintenance_mode'
        )
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

    // ======================================
    // SAVE SETTINGS
    // PUT /api/settings
    // ======================================

    if (req.method === "PUT") {
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

      // Validate every setting before writing anything.
      for (const [key, value] of entries) {
        const error = validateSetting(key, value);

        if (error) {
          return json(res, 400, {
            success: false,
            message: error
          });
        }

        let serialized;

        try {
          serialized = JSON.stringify(value);
        } catch {
          return json(res, 400, {
            success: false,
            message: `Could not serialize "${key}".`
          });
        }

        if (
          serialized === undefined ||
          serialized.length > 100000
        ) {
          return json(res, 400, {
            success: false,
            message: `"${key}" is too large or invalid.`
          });
        }
      }

      // Save validated settings.
      for (const [key, value] of entries) {
        const serialized = JSON.stringify(value);

        await sql`
          INSERT INTO settings (key, value)
          VALUES (${key}, ${serialized})
          ON CONFLICT (key)
          DO UPDATE SET
            value = EXCLUDED.value,
            updated_at = NOW()
        `;
      }

      // Record the change.
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
        message: "Website settings saved successfully.",
        updated: entries.map(([key]) => key)
      });
    }

  } catch (error) {
    console.error("Settings API error:", error);

    return json(res, 500, {
      success: false,
      message: "Website settings operation failed."
    });
  }
}
