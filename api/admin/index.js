import { sql, json, method, requireAdmin, audit } from "../_db.js";

export default async function handler(req, res) {
  const view = String(req.query?.view || "manage");

  if (view === "overview") {
    if (!method(req, res, ["GET"])) return;

    try {
      const admin = await requireAdmin(req, res);
      if (!admin) return;

      const [users, books, articles, orders, revenue, subscribers] =
        await Promise.all([
          sql`SELECT COUNT(*)::int AS count FROM users`,
          sql`SELECT COUNT(*)::int AS count FROM books WHERE active = TRUE`,
          sql`SELECT COUNT(*)::int AS count FROM articles`,
          sql`SELECT COUNT(*)::int AS count FROM orders`,
          sql`SELECT COALESCE(SUM(total), 0)::numeric AS total
              FROM orders WHERE status IN ('paid','processing','completed')`,
          sql`SELECT COUNT(*)::int AS count
              FROM newsletter_subscribers WHERE status = 'active'`
        ]);

      return json(res, 200, {
        success: true,
        stats: {
          users: users[0].count,
          books: books[0].count,
          articles: articles[0].count,
          orders: orders[0].count,
          revenue: revenue[0].total,
          subscribers: subscribers[0].count
        }
      });
    } catch (e) {
      console.error(e);
      return json(res, 500, {
        success: false,
        message: "Could not load dashboard."
      });
    }
  }

  if (view === "manage") {
    if (!method(req, res, ["GET", "PATCH"])) return;

    try {
      const admin = await requireAdmin(req, res);
      if (!admin) return;

      if (req.method === "GET") {
        const users = await sql`
          SELECT id,name,email,role,status,created_at
          FROM users ORDER BY created_at DESC LIMIT 300`;

        const orders = await sql`
          SELECT id,customer_name,customer_email,items,total,status,created_at
          FROM orders ORDER BY created_at DESC LIMIT 300`;

        const logs = await sql`
          SELECT id,action,target_type,target_id,details,created_at
          FROM audit_logs ORDER BY created_at DESC LIMIT 100`;

        return json(res, 200, { success: true, users, orders, logs });
      }

      const {
        user_id, role, status,
        order_id, order_status
      } = req.body || {};

      let changed = false;

      if (user_id !== undefined) {
        if (admin.role !== "admin") {
          return json(res, 403, {
            success: false,
            message: "Only an administrator can manage user accounts."
          });
        }

        const id = Number(user_id);
        if (!Number.isSafeInteger(id) || id < 1) {
          return json(res, 400, { success: false, message: "Invalid user id." });
        }

        if (id === Number(admin.id)) {
          return json(res, 400, {
            success: false,
            message: "You cannot change your own account here."
          });
        }

        const allowedRoles = ["user", "editor", "admin"];
        const allowedStatuses = ["active", "inactive", "suspended"];

        if (role !== undefined && !allowedRoles.includes(role)) {
          return json(res, 400, { success: false, message: "Invalid user role." });
        }

        if (status !== undefined && !allowedStatuses.includes(status)) {
          return json(res, 400, { success: false, message: "Invalid user status." });
        }

        if (role === undefined && status === undefined) {
          return json(res, 400, { success: false, message: "No user changes supplied." });
        }

        const rows = await sql`
          UPDATE users
          SET role = COALESCE(${role ?? null}, role),
              status = COALESCE(${status ?? null}, status),
              updated_at = NOW()
          WHERE id = ${id}
          RETURNING id`;

        if (!rows.length) {
          return json(res, 404, { success: false, message: "User not found." });
        }

        await audit(admin.id, "user.update", "user", id, { role, status });
        changed = true;
      }

      if (order_id !== undefined) {
        const id = Number(order_id);
        const allowed = ["pending", "paid", "processing", "completed", "cancelled"];

        if (!Number.isSafeInteger(id) || id < 1 || !allowed.includes(order_status)) {
          return json(res, 400, { success: false, message: "Invalid order update." });
        }

        const rows = await sql`
          UPDATE orders
          SET status = ${order_status}, updated_at = NOW()
          WHERE id = ${id}
          RETURNING id`;

        if (!rows.length) {
          return json(res, 404, { success: false, message: "Order not found." });
        }

        await audit(admin.id, "order.update", "order", id, {
          status: order_status
        });
        changed = true;
      }

      if (!changed) {
        return json(res, 400, { success: false, message: "No changes supplied." });
      }

      return json(res, 200, { success: true });
    } catch (e) {
      console.error(e);
      return json(res, 500, {
        success: false,
        message: "Admin operation failed."
      });
    }
  }

  return json(res, 404, { success: false, message: "Unknown admin action." });
}
