
import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";

// ==========================================
// DATABASE CONNECTION
// ==========================================

const databaseUrl = process.env.DATABASE_URL;

export const sql = databaseUrl
  ? neon(databaseUrl)
  : function () {
      throw new Error(
        "DATABASE_URL is missing. Configure it in Vercel Environment Variables."
      );
    };

const cookieName = "dsr_session";
const SESSION_DURATION = 7 * 24 * 60 * 60;

// ==========================================
// API RESPONSE
// ==========================================

export function json(res, status, body) {
  res.status(status);
  res.setHeader(
    "Content-Type",
    "application/json; charset=utf-8"
  );
  res.setHeader("Cache-Control", "no-store");
  return res.end(JSON.stringify(body));
}

export function method(req, res, allowed) {
  if (!allowed.includes(req.method)) {
    res.setHeader("Allow", allowed.join(", "));
    json(res, 405, {
      success: false,
      message: "Method not allowed."
    });
    return false;
  }

  return true;
}

// ==========================================
// COOKIE MANAGEMENT
// ==========================================

export function getCookie(req, name) {
  const raw = req.headers.cookie || "";

  const item = raw
    .split(";")
    .map(x => x.trim())
    .find(x => x.startsWith(name + "="));

  if (!item) return null;

  try {
    return decodeURIComponent(
      item.slice(name.length + 1)
    );
  } catch {
    return null;
  }
}

export function setSessionCookie(res, token) {
  const secure =
    process.env.NODE_ENV === "production"
      ? "; Secure"
      : "";

  res.setHeader(
    "Set-Cookie",
    `${cookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DURATION}${secure}`
  );
}

export function clearSessionCookie(res) {
  const secure =
    process.env.NODE_ENV === "production"
      ? "; Secure"
      : "";

  res.setHeader(
    "Set-Cookie",
    `${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`
  );
}

// ==========================================
// TOKEN SECURITY
// ==========================================

export function hashToken(token) {
  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
}

// ==========================================
// CURRENT USER
// ==========================================

export async function currentUser(req) {
  const token = getCookie(req, cookieName);

  if (!token) return null;

  const rows = await sql`
    SELECT
      u.id,
      u.name,
      u.email,
      u.role,
      u.status
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ${hashToken(token)}
      AND s.expires_at > NOW()
      AND u.status = 'active'
    LIMIT 1
  `;

  return rows[0] || null;
}

// ==========================================
// USER AUTHORIZATION
// ==========================================

export async function requireUser(req, res) {
  const user = await currentUser(req);

  if (!user) {
    json(res, 401, {
      success: false,
      message: "Please log in."
    });

    return null;
  }

  return user;
}

// Admin and Editor access
export async function requireAdmin(req, res) {
  const user = await requireUser(req, res);

  if (!user) return null;

  if (!["admin", "editor"].includes(user.role)) {
    json(res, 403, {
      success: false,
      message: "Administrator permission required."
    });

    return null;
  }

  return user;
}

// Admin-only access for sensitive operations
export async function requireSuperAdmin(req, res) {
  const user = await requireUser(req, res);

  if (!user) return null;

  if (user.role !== "admin") {
    json(res, 403, {
      success: false,
      message: "Admin permission required."
    });

    return null;
  }

  return user;
}

// ==========================================
// SESSION CREATION
// ==========================================

export async function createSession(userId, res) {
  const token = crypto
    .randomBytes(32)
    .toString("base64url");

  await sql`
    INSERT INTO sessions (
      user_id,
      token_hash,
      expires_at
    )
    VALUES (
      ${userId},
      ${hashToken(token)},
      NOW() + INTERVAL '7 days'
    )
  `;

  setSessionCookie(res, token);
}

// ==========================================
// AUDIT LOGS
// ==========================================

export async function audit(
  userId,
  action,
  targetType = null,
  targetId = null,
  details = {}
) {
  try {
    await sql`
      INSERT INTO audit_logs (
        user_id,
        action,
        target_type,
        target_id,
        details
      )
      VALUES (
        ${userId},
        ${action},
        ${targetType},
        ${targetId},
        ${JSON.stringify(details)}::jsonb
      )
    `;
  } catch (e) {
    console.error("Audit log failed:", e);
  }
}

// ==========================================
// INITIAL ADMIN ACCOUNT
// ==========================================

export async function ensureAdmin() {
  const email = (process.env.ADMIN_EMAIL || "")
    .trim()
    .toLowerCase();

  const password = process.env.ADMIN_PASSWORD || "";

  if (!email || !password) {
    console.warn(
      "ADMIN_EMAIL or ADMIN_PASSWORD is not configured."
    );
    return false;
  }

  const found = await sql`
    SELECT id
    FROM users
    WHERE lower(email) = ${email}
    LIMIT 1
  `;

  if (found.length) return true;

  const hash = await bcrypt.hash(password, 12);

  await sql`
    INSERT INTO users (
      name,
      email,
      password_hash,
      role,
      status
    )
    VALUES (
      'Administrator',
      ${email},
      ${hash},
      'admin',
      'active'
    )
    ON CONFLICT (email) DO NOTHING
  `;

  return true;
}
