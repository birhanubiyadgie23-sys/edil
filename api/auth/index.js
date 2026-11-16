
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

// ==========================================
// VALIDATION HELPERS
// ==========================================

function normalizeEmail(value) {
  if (typeof value !== "string") return "";

  return value.trim().toLowerCase();
}

function validEmail(email) {
  return (
    typeof email === "string" &&
    email.length > 0 &&
    email.length <= 255 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  );
}

function validPassword(password) {
  return (
    typeof password === "string" &&
    password.length > 0 &&
    Buffer.byteLength(password, "utf8") <= 72
  );
}

function validName(name) {
  return (
    typeof name === "string" &&
    name.trim().length > 0 &&
    name.trim().length <= 150
  );
}

// ==========================================
// MAIN HANDLER
// ==========================================

export default async function handler(req, res) {
  const action = String(
    req.query?.action || ""
  ).toLowerCase();

  // ========================================
  // LOGIN
  // POST /api/auth?action=login
  // ========================================

  if (action === "login") {
    if (!method(req, res, ["POST"])) return;

    const email = normalizeEmail(req.body?.email);
    const password = req.body?.password;

    if (!validEmail(email) || !validPassword(password)) {
      return json(res, 400, {
        success: false,
        message: "Please enter a valid email and password."
      });
    }

    try {
      await ensureAdmin();

      const rows = await sql`
        SELECT
          id,
          name,
          email,
          password_hash,
          role,
          status
        FROM users
        WHERE LOWER(email) = ${email}
        LIMIT 1
      `;

      const user = rows[0];

      if (!user || user.status !== "active") {
        return json(res, 401, {
          success: false,
          message: "Email or password is incorrect."
        });
      }

      const passwordMatches = await bcrypt.compare(
        password,
        user.password_hash
      );

      if (!passwordMatches) {
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
        message: "Login failed. Please try again."
      });
    }
  }

  // ========================================
  // REGISTER
  // POST /api/auth?action=register
  // ========================================

  if (action === "register") {
    if (!method(req, res, ["POST"])) return;

    const name =
      typeof req.body?.name === "string"
        ? req.body.name.trim()
        : "";

    const email = normalizeEmail(req.body?.email);
    const password = req.body?.password;

    if (!validName(name)) {
      return json(res, 400, {
        success: false,
        message: "Name is required and must not exceed 150 characters."
      });
    }

    if (!validEmail(email)) {
      return json(res, 400, {
        success: false,
        message: "Please enter a valid email address."
      });
    }

    if (
      typeof password !== "string" ||
      password.length < 10 ||
      !validPassword(password)
    ) {
      return json(res, 400, {
        success: false,
        message: "Password must contain at least 10 characters and must not exceed 72 UTF-8 bytes."
      });
    }

    try {
      // Check existing email without case sensitivity.

      const existing = await sql`
        SELECT id
        FROM users
        WHERE LOWER(email) = ${email}
        LIMIT 1
      `;

      if (existing.length > 0) {
        return json(res, 409, {
          success: false,
          message: "This email is already registered."
        });
      }

      const passwordHash = await bcrypt.hash(password, 12);

      const rows = await sql`
        INSERT INTO users (
          name,
          email,
          password_hash,
          role,
          status
        )
        VALUES (
          ${name},
          ${email},
          ${passwordHash},
          'user',
          'active'
        )
        RETURNING
          id,
          name,
          email,
          role
      `;

      const user = rows[0];

      if (!user) {
        throw new Error("User registration returned no account.");
      }

      await createSession(user.id, res);

      return json(res, 201, {
        success: true,
        user
      });

    } catch (error) {
      // PostgreSQL unique constraint violation.

      if (error?.code === "23505") {
        return json(res, 409, {
          success: false,
          message: "This email is already registered."
        });
      }

      console.error("Register error:", error);

      return json(res, 500, {
        success: false,
        message: "Could not create account. Please try again."
      });
    }
  }

  // ========================================
  // CURRENT USER
  // GET /api/auth?action=me
  // ========================================

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
      console.error("Session verification error:", error);

      return json(res, 500, {
        success: false,
        message: "Could not verify your session."
      });
    }
  }

  // ========================================
  // LOGOUT
  // POST /api/auth?action=logout
  // ========================================

  if (action === "logout") {
    if (!method(req, res, ["POST"])) return;

    const token = getCookie(req, "dsr_session");

    try {
      if (token) {
        await sql`
          DELETE FROM sessions
          WHERE token_hash = ${hashToken(token)}
        `;
      }

      clearSessionCookie(res);

      return json(res, 200, {
        success: true,
        message: "Logged out successfully."
      });

    } catch (error) {
      console.error("Logout error:", error);

      clearSessionCookie(res);

      return json(res, 500, {
        success: false,
        message: "Could not complete logout. Please try again."
      });
    }
  }

  // ========================================
  // UNKNOWN ACTION
  // ========================================

  return json(res, 404, {
    success: false,
    message: "Unknown authentication action."
  });
}
