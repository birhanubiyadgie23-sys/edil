import {
  sql,
  json,
  method,
  requireSuperAdmin,
  audit
} from "../_db.js";

// ==========================================
// ADMIN API
// ==========================================

const ORDER_STATUSES = new Set([
  "pending",
  "paid",
  "processing",
  "shipped",
  "completed",
  "cancelled",
  "refunded"
]);

const USER_ROLES = new Set([
  "admin",
  "editor",
  "user"
]);

const USER_STATUSES = new Set([
  "active",
  "suspended",
  "inactive"
]);

function validId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

// ==========================================
// OVERVIEW STATISTICS
// GET /api/admin?view=overview
// ==========================================

async function getOverview(res) {
  const [
    usersResult,
    booksResult,
    articlesResult,
    ordersResult,
    revenueResult,
    subscribersResult
  ] = await Promise.all([
    sql`
      SELECT COUNT(*)::int AS total
      FROM users
    `,

    sql`
      SELECT COUNT(*)::int AS total
      FROM books
    `,

    sql`
      SELECT COUNT(*)::int AS total
      FROM articles
    `,

    sql`
      SELECT COUNT(*)::int AS total
      FROM orders
    `,

    sql`
      SELECT COALESCE(SUM(total), 0) AS total
      FROM orders
      WHERE LOWER(status) IN ('paid', 'completed')
    `,

    sql`
      SELECT COUNT(*)::int AS total
      FROM newsletter_subscribers
    `
  ]);

  return json(res, 200, {
    success: true,
    stats: {
      users: usersResult[0]?.total ?? 0,
      books: booksResult[0]?.total ?? 0,
      articles: articlesResult[0]?.total ?? 0,
      orders: ordersResult[0]?.total ?? 0,
      revenue: String(revenueResult[0]?.total ?? 0),
      subscribers: subscribersResult[0]?.total ?? 0
    }
  });
}

// ==========================================
// ADMIN MANAGEMENT
// GET /api/admin?view=manage
// ==========================================

async function getManagement(res) {
  const [orders, users, logs] = await Promise.all([
    sql`
      SELECT
        id,
        user_id,
        customer_name,
        customer_email,
        items,
        total,
        status,
        created_at,
        updated_at
      FROM orders
      ORDER BY created_at DESC
      LIMIT 200
    `,

    sql`
      SELECT
        id,
        name,
        email,
        role,
        status,
        created_at,
        updated_at
      FROM users
      ORDER BY created_at DESC
      LIMIT 200
    `,

    sql`
      SELECT
        l.id,
        l.user_id,
        u.name AS user_name,
        u.email AS user_email,
        l.action,
        l.target_type,
        l.target_id,
        l.details,
        l.created_at
      FROM audit_logs l
      LEFT JOIN users u ON u.id = l.user_id
      ORDER BY l.created_at DESC
      LIMIT 100
    `
  ]);

  return json(res, 200, {
    success: true,
    orders,
    users,
    logs
  });
}

// ==========================================
// UPDATE ORDER STATUS
// PATCH /api/admin?view=manage
// ==========================================

async function updateOrder(req, res, admin) {
  const id = validId(req.body?.order_id);
  const status = String(req.body?.order_status || "")
    .trim()
    .toLowerCase();

  if (!id) {
    return json(res, 400, {
      success: false,
      message: "A valid order ID is required."
    });
  }

  if (!ORDER_STATUSES.has(status)) {
    return json(res, 400, {
      success: false,
      message: "Invalid order status."
    });
  }

  const result = await sql`
    UPDATE orders
    SET
      status = ${status},
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING id, status
  `;

  if (!result.length) {
    return json(res, 404, {
      success: false,
      message: "Order not found."
    });
  }

  await audit(
    admin.id,
    "order.status.update",
    "order",
    String(id),
    {
      status
    }
  );

  return json(res, 200, {
    success: true,
    message: "Order status updated successfully.",
    order: result[0]
  });
}

// ==========================================
// UPDATE USER ROLE
// PATCH /api/admin?view=manage
// ==========================================

async function updateUserRole(req, res, admin) {
  const id = validId(req.body?.user_id);
  const role = String(req.body?.role || "")
    .trim()
    .toLowerCase();

  if (!id) {
    return json(res, 400, {
      success: false,
      message: "A valid user ID is required."
    });
  }

  if (!USER_ROLES.has(role)) {
    return json(res, 400, {
      success: false,
      message: "Invalid user role."
    });
  }

  if (Number(admin.id) === id) {
    return json(res, 400, {
      success: false,
      message: "You cannot change your own role."
    });
  }

  const result = await sql`
    UPDATE users
    SET
      role = ${role},
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING id, name, email, role, status
  `;

  if (!result.length) {
    return json(res, 404, {
      success: false,
      message: "User not found."
    });
  }

  await audit(
    admin.id,
    "user.role.update",
    "user",
    String(id),
    {
      role
    }
  );

  return json(res, 200, {
    success: true,
    message: "User role updated successfully.",
    user: result[0]
  });
}

// ==========================================
// UPDATE USER STATUS
// PATCH /api/admin?view=manage
// ==========================================

async function updateUserStatus(req, res, admin) {
  const id = validId(req.body?.user_id);
  const status = String(req.body?.status || "")
    .trim()
    .toLowerCase();

  if (!id) {
    return json(res, 400, {
      success: false,
      message: "A valid user ID is required."
    });
  }

  if (!USER_STATUSES.has(status)) {
    return json(res, 400, {
      success: false,
      message: "Invalid user status."
    });
  }

  if (Number(admin.id) === id) {
    return json(res, 400, {
      success: false,
      message: "You cannot change your own account status."
    });
  }

  const result = await sql`
    UPDATE users
    SET
      status = ${status},
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING id, name, email, role, status
  `;

  if (!result.length) {
    return json(res, 404, {
      success: false,
      message: "User not found."
    });
  }

  await audit(
    admin.id,
    "user.status.update",
    "user",
    String(id),
    {
      status
    }
  );

  return json(res, 200, {
    success: true,
    message: "User status updated successfully.",
    user: result[0]
  });
}

// ==========================================
// MAIN HANDLER
// ==========================================

export default async function handler(req, res) {
  if (!method(req, res, ["GET", "PATCH"])) {
    return;
  }

  try {
    // All admin operations require a super admin.
    const admin = await requireSuperAdmin(req, res);
    if (!admin) return;

    const view = req.query?.view;

    // GET requests
    if (req.method === "GET") {
      if (view === "overview") {
        return await getOverview(res);
      }

      if (view === "manage") {
        return await getManagement(res);
      }

      return json(res, 400, {
        success: false,
        message: "Invalid admin view."
      });
    }

    // PATCH requests
    if (req.method === "PATCH") {
      if (view !== "manage") {
        return json(res, 400, {
          success: false,
          message: "Invalid management request."
        });
      }

      if (req.body?.order_id !== undefined) {
        return await updateOrder(req, res, admin);
      }

      if (
        req.body?.user_id !== undefined &&
        req.body?.role !== undefined
      ) {
        return await updateUserRole(req, res, admin);
      }

      if (
        req.body?.user_id !== undefined &&
        req.body?.status !== undefined
      ) {
        return await updateUserStatus(req, res, admin);
      }

      return json(res, 400, {
        success: false,
        message: "Invalid management data."
      });
    }

  } catch (error) {
    console.error("Admin API error:", error);

    return json(res, 500, {
      success: false,
      message: "Admin operation failed."
    });
  }
}
