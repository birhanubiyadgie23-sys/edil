import bcrypt from "bcryptjs";
import { sql, json, method, createSession, ensureAdmin } from "../_db.js";

export default async function handler(req, res) {
  if (!method(req, res, ["POST"])) return;
  const { email, password } = req.body || {};
  if (!email || !password) return json(res, 400, { success:false, message:"Email and password are required." });
  try {
    await ensureAdmin();
    const rows = await sql`SELECT id,name,email,password_hash,role,status FROM users WHERE lower(email)=${String(email).toLowerCase()} LIMIT 1`;
    const user = rows[0];
    if (!user || user.status !== "active" || !(await bcrypt.compare(password, user.password_hash)))
      return json(res, 401, { success:false, message:"Email or password is incorrect." });
    await createSession(user.id, res);
    json(res, 200, { success:true, user:{ id:user.id,name:user.name,email:user.email,role:user.role } });
  } catch (e) { console.error(e); json(res, 500, { success:false, message:"Login failed." }); }
}
