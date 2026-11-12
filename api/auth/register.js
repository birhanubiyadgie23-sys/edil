import bcrypt from "bcryptjs";
import { sql, json, method, createSession } from "../_db.js";

export default async function handler(req, res) {
  if (!method(req, res, ["POST"])) return;
  const { name, email, password } = req.body || {};
  if (!name?.trim() || !email?.trim() || typeof password !== "string" || password.length < 10)
    return json(res, 400, { success:false, message:"Name, valid email, and a password of at least 10 characters are required." });
  try {
    const hash = await bcrypt.hash(password, 12);
    const rows = await sql`
      INSERT INTO users (name,email,password_hash)
      VALUES (${name.trim()},${email.trim().toLowerCase()},${hash})
      RETURNING id,name,email,role
    `;
    await createSession(rows[0].id, res);
    json(res, 201, { success:true, user:rows[0] });
  } catch (e) {
    if (e.code === "23505") return json(res, 409, { success:false, message:"This email is already registered." });
    console.error(e); json(res, 500, { success:false, message:"Could not create account." });
  }
}
