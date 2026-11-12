import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";

export const sql = neon(process.env.DATABASE_URL || "");
const cookieName = "dsr_session";

export function json(res, status, body) {
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}
export function method(req, res, allowed) {
  if (!allowed.includes(req.method)) {
    res.setHeader("Allow", allowed.join(", "));
    json(res, 405, { success: false, message: "Method not allowed." });
    return false;
  }
  return true;
}
export function getCookie(req, name) {
  const raw = req.headers.cookie || "";
  const item = raw.split(";").map(x => x.trim()).find(x => x.startsWith(name + "="));
  return item ? decodeURIComponent(item.slice(name.length + 1)) : null;
}
export function setSessionCookie(res, token) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${cookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${secure}`);
}
export function clearSessionCookie(res) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
}
export function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}
export async function currentUser(req) {
  const token = getCookie(req, cookieName);
  if (!token) return null;
  const rows = await sql`
    SELECT u.id, u.name, u.email, u.role, u.status
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ${hashToken(token)}
      AND s.expires_at > NOW() AND u.status = 'active'
    LIMIT 1
  `;
  return rows[0] || null;
}
export async function requireUser(req, res) {
  const user = await currentUser(req);
  if (!user) { json(res, 401, { success: false, message: "Please log in." }); return null; }
  return user;
}
export async function requireAdmin(req, res) {
  const user = await requireUser(req, res);
  if (!user) return null;
  if (!["admin", "editor"].includes(user.role)) {
    json(res, 403, { success: false, message: "Administrator permission required." });
    return null;
  }
  return user;
}
export async function createSession(userId, res) {
  const token = crypto.randomBytes(32).toString("base64url");
  await sql`
    INSERT INTO sessions (user_id, token_hash, expires_at)
    VALUES (${userId}, ${hashToken(token)}, NOW() + INTERVAL '7 days')
  `;
  setSessionCookie(res, token);
}
export async function audit(userId, action, targetType = null, targetId = null, details = {}) {
  try {
    await sql`
      INSERT INTO audit_logs (user_id, action, target_type, target_id, details)
      VALUES (${userId}, ${action}, ${targetType}, ${targetId}, ${JSON.stringify(details)}::jsonb)
    `;
  } catch (e) { console.error("Audit log failed:", e); }
}
export async function ensureAdmin() {
  const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "";
  if (!email || !password) return;
  const found = await sql`SELECT id FROM users WHERE lower(email) = ${email} LIMIT 1`;
  if (found.length) return;
  const hash = await bcrypt.hash(password, 12);
  await sql`
    INSERT INTO users (name, email, password_hash, role, status)
    VALUES ('Administrator', ${email}, ${hash}, 'admin', 'active')
    ON CONFLICT (email) DO NOTHING
  `;
}
