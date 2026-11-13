
import bcrypt from "bcryptjs";
import {
  sql,
  json,
  method,
  createSession,
  ensureAdmin,
  currentUser,
  getCookie,
  hashToken,
  clearSessionCookie
} from "../_db.js";

export default async function handler(req, res) {
  const action = String(req.query?.action || "").toLowerCase();

  // ==============================
  // LOGIN
  // GET/POST /api/auth?action=login
  // ==============================
  if (action === "login") {
    if (!method(req, res, ["POST"])) return;

    const { email, password } = req.body || {};

    if (!email || !password) {
      return json(res, 400, {
        success: false,
        message: "Email and password are required."
      });
    }

    try {
      await ensureAdmin();

      const rows = await sql`
        SELECT id, name, email, password_hash, role, status
        FROM users
        WHERE lower(email) = ${String(email).toLowerCase()}
        LIMIT 1
      `;

      const user = rows[0];

      if (
        !user ||
        user.status !== "active" ||
        !(await bcrypt.compare(password, user.password_hash))
      ) {
        return json(res, 401, {
          success: false,
          message: "Email or password is incorrect."
        });
      }

      await createSession(user.id, res);

      return json(res, 200, {
        success: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role
        }
      });
    } catch (error) {
      console.error("Login error:", error);
      return json(res, 500, {
        success: false,
        message: "Login failed."
      });
    }
  }

  // ==============================
  // REGISTER
  // POST /api/auth?action=register
  // ==============================
  if (action === "register") {
    if (!method(req, res, ["POST"])) return;

    const { name, email, password } = req.body || {};

    if (
      !name?.trim() ||
      !email?.trim() ||
      typeof password !== "string" ||
      password.length < 10
    ) {
      return json(res, 400, {
        success: false,
        message: "Name, valid email, and a password of at least 10 characters are required."
      });
    }

    try {
      const hash = await bcrypt.hash(password, 12);

      const rows = await sql`
        INSERT INTO users (name, email, password_hash)
        VALUES (
          ${name.trim()},
          ${email.trim().toLowerCase()},
          ${hash}
        )
        RETURNING id, name, email, role
      `;

      await createSession(rows[0].id, res);

      return json(res, 201, {
        success: true,
        user: rows[0]
      });
    } catch (error) {
      if (error.code === "23505") {
        return json(res, 409, {
          success: false,
          message: "This email is already registered."
        });
      }

      console.error("Register error:", error);

      return json(res, 500, {
        success: false,
        message: "Could not create account."
      });
    }
  }

  // ==============================
  // CURRENT USER
  // GET /api/auth?action=me
  // ==============================
  if (action === "me") {
    if (!method(req, res, ["GET"])) return;

    try {
      const user = await currentUser(req);

      return json(res, 200, {
        success: true,
        user: user
          ? {
              id: user.id,
              name: user.name,
              email: user.email,
              role: user.role
            }
          : null
      });
    } catch (error) {
      console.error("Auth session error:", error);

      return json(res, 500, {
        success: false,
        message: "Could not verify session."
      });
    }
  }

  // ==============================
  // LOGOUT
  // POST /api/auth?action=logout
  // ==============================
  if (action === "logout") {
    if (!method(req, res, ["POST"])) return;

    const token = getCookie(req, "dsr_session");

    if (token) {
      try {
        await sql`
          DELETE FROM sessions
          WHERE token_hash = ${hashToken(token)}
        `;
      } catch (error) {
        console.error("Logout session error:", error);
      }
    }

    clearSessionCookie(res);

    return json(res, 200, {
      success: true
    });
  }

  return json(res, 404, {
    success: false,
    message: "Unknown authentication action."
  });
}
