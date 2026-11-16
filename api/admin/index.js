
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

// ==========================================
// ID VALIDATION
// Supports PostgreSQL BIGINT IDs safely.
// ==========================================

function validId(value) {
  let id;

  if (
    typeof value === "number" &&
    Number.isSafeInteger(value)
  ) {
    id = String(value);
  } else if (
    typeof value === "string" &&
    /^\d+$/.test(value.trim())
  ) {
    id = value.trim();
  } else {
    return null;
  }

  id = id.replace(/^0+(?=\d)/, "");

  const max = "9223372036854775807";

  if (
    id === "0" ||
    id.length > 19 ||
    (id.length === 19 && id > max)
  ) {
    return null;
  }

  return id;
}

function sameId(first, second) {
  return String(first) === String(second);
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
      WHERE LOWER(status) IN (
        'paid',
        'processing',
        'shipped',
        'completed'
      )
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
      FROM audit_logs AS l
      LEFT JOIN users AS u
        ON u.id = l.user_id
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

  /*
   * ORDER STATUS TRANSITIONS
   *
   * pending:
   *   -> paid
   *   -> cancelled
   *
   * paid:
   *   -> processing
   *   -> cancelled
   *   -> refunded
   *
   * processing:
   *   -> shipped
   *   -> cancelled
   *   -> refunded
   *
   * shipped:
   *   -> completed
   *   -> refunded
   *
   * completed:
   *   -> refunded
   *
   * cancelled and refunded are terminal states.
   *
   * Inventory is restored only when the order has not
   * yet reached the shipped stage.
   */

  const result = await sql`
    WITH requested_status AS MATERIALIZED (
      SELECT ${status}::text AS new_status
    ),

    target AS MATERIALIZED (
      SELECT
        id,
        status,
        items
      FROM orders
      WHERE id = ${id}
      FOR UPDATE
    ),

    decision AS MATERIALIZED (
      SELECT
        t.id,
        t.status AS old_status,
        t.items,
        s.new_status,

        CASE
          WHEN t.status = s.new_status
            THEN TRUE

          WHEN t.status = 'pending'
            AND s.new_status IN (
              'paid',
              'cancelled'
            )
            THEN TRUE

          WHEN t.status = 'paid'
            AND s.new_status IN (
              'processing',
              'cancelled',
              'refunded'
            )
            THEN TRUE

          WHEN t.status = 'processing'
            AND s.new_status IN (
              'shipped',
              'cancelled',
              'refunded'
            )
            THEN TRUE

          WHEN t.status = 'shipped'
            AND s.new_status IN (
              'completed',
              'refunded'
            )
            THEN TRUE

          WHEN t.status = 'completed'
            AND s.new_status = 'refunded'
            THEN TRUE

          ELSE FALSE
        END AS transition_allowed,

        (
          s.new_status IN (
            'cancelled',
            'refunded'
          )
          AND t.status IN (
            'pending',
            'paid',
            'processing'
          )
        ) AS should_restock

      FROM target AS t
      CROSS JOIN requested_status AS s
    ),

    item_values AS MATERIALIZED (
      SELECT
        element.value AS item
      FROM decision AS d
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(d.items) = 'array'
            THEN d.items
          ELSE '[]'::jsonb
        END
      ) AS element(value)
      WHERE
        d.transition_allowed = TRUE
        AND d.should_restock = TRUE
    ),

    parsed_items AS MATERIALIZED (
      SELECT
        CASE
          WHEN (item ->> 'id') ~ '^[1-9][0-9]{0,9}$'
          THEN
            CASE
              WHEN (item ->> 'id')::numeric <= 2147483647
                THEN (item ->> 'id')::integer
              ELSE NULL
            END
          ELSE NULL
        END AS book_id,

        CASE
          WHEN (item ->> 'quantity') ~ '^[1-9][0-9]{0,6}$'
          THEN
            CASE
              WHEN (item ->> 'quantity')::numeric <= 1000000
                THEN (item ->> 'quantity')::integer
              ELSE NULL
            END
          ELSE NULL
        END AS quantity

      FROM item_values
    ),

    item_check AS MATERIALIZED (
      SELECT
        COUNT(*)::bigint AS total_items,

        COUNT(*) FILTER (
          WHERE
            book_id IS NOT NULL
            AND quantity IS NOT NULL
        )::bigint AS valid_items

      FROM parsed_items
    ),

    restock_items AS MATERIALIZED (
      SELECT
        book_id,
        SUM(quantity)::bigint AS quantity
      FROM parsed_items
      WHERE
        book_id IS NOT NULL
        AND quantity IS NOT NULL
      GROUP BY book_id
    ),

    locked_books AS MATERIALIZED (
      SELECT
        b.id,
        b.stock,
        r.quantity
      FROM books AS b
      INNER JOIN restock_items AS r
        ON r.book_id = b.id
      ORDER BY b.id
      FOR UPDATE OF b
    ),

    restock_gate AS MATERIALIZED (
      SELECT
        CASE
          WHEN d.transition_allowed IS NOT TRUE
            THEN FALSE

          WHEN d.should_restock IS NOT TRUE
            THEN TRUE

          WHEN (
            SELECT total_items
            FROM item_check
          ) = 0
            THEN FALSE

          WHEN (
            SELECT total_items
            FROM item_check
          ) <> (
            SELECT valid_items
            FROM item_check
          )
            THEN FALSE

          WHEN (
            SELECT COUNT(*)
            FROM locked_books
          ) <> (
            SELECT COUNT(*)
            FROM restock_items
          )
            THEN FALSE

          WHEN EXISTS (
            SELECT 1
            FROM locked_books AS lb
            WHERE
              lb.stock IS NULL
              OR lb.stock < 0
              OR lb.stock::bigint + lb.quantity > 1000000
          )
            THEN FALSE

          ELSE TRUE
        END AS can_update

      FROM decision AS d
    ),

    restocked_books AS (
      UPDATE books AS b
      SET
        stock = (
          b.stock::bigint + lb.quantity
        )::integer,
        updated_at = NOW()
      FROM locked_books AS lb
      CROSS JOIN restock_gate AS g
      WHERE
        g.can_update = TRUE
        AND b.id = lb.id
      RETURNING b.id
    ),

    updated_order AS (
      UPDATE orders AS o
      SET
        status = d.new_status,
        updated_at = NOW()
      FROM decision AS d
      CROSS JOIN restock_gate AS g
      WHERE
        o.id = d.id
        AND g.can_update = TRUE
        AND (
          d.should_restock = FALSE
          OR (
            SELECT COUNT(*)
            FROM restocked_books
          ) = (
            SELECT COUNT(*)
            FROM restock_items
          )
        )
      RETURNING
        o.id,
        o.status,
        o.updated_at
    )

    SELECT
      d.id AS existing_order_id,
      d.old_status,
      d.new_status,
      d.transition_allowed,
      d.should_restock,
      g.can_update,

      u.id AS updated_order_id,
      u.status AS updated_status,
      u.updated_at,

      (
        SELECT COUNT(*)
        FROM restocked_books
      ) AS restocked_book_count

    FROM decision AS d
    CROSS JOIN restock_gate AS g
    LEFT JOIN updated_order AS u
      ON u.id = d.id
  `;

  if (!result.length) {
    return json(res, 404, {
      success: false,
      message: "Order not found."
    });
  }

  const orderResult = result[0];

  if (orderResult.transition_allowed !== true) {
    return json(res, 409, {
      success: false,
      message:
        `Order cannot move from ` +
        `${orderResult.old_status} to ${status}.`
    });
  }

  if (
    orderResult.can_update !== true ||
    !orderResult.updated_order_id
  ) {
    return json(res, 409, {
      success: false,
      message:
        "The order status was not changed because its inventory could not be restored safely. Check the order items and book records."
    });
  }

  const stockRestored =
    orderResult.should_restock === true;

  await audit(
    admin.id,
    "order.status.update",
    "order",
    id,
    {
      previous_status: orderResult.old_status,
      new_status: status,
      stock_restored: stockRestored,
      restocked_book_count: Number(
        orderResult.restocked_book_count || 0
      )
    }
  );

  let message = "Order status updated successfully.";

  if (stockRestored) {
    message += " Book stock was restored.";
  } else if (
    status === "refunded" &&
    ["shipped", "completed"].includes(
      orderResult.old_status
    )
  ) {
    message +=
      " Stock was not automatically restored because the order had already shipped. Verify the physical return before adjusting inventory.";
  }

  return json(res, 200, {
    success: true,
    message,
    order: {
      id: orderResult.updated_order_id,
      status: orderResult.updated_status,
      updated_at: orderResult.updated_at
    },
    inventory: {
      restored: stockRestored,
      books: Number(
        orderResult.restocked_book_count || 0
      )
    }
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

  if (sameId(admin.id, id)) {
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
    RETURNING
      id,
      name,
      email,
      role,
      status
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
    id,
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

  if (sameId(admin.id, id)) {
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
    RETURNING
      id,
      name,
      email,
      role,
      status
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
    id,
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
    // All admin operations require super admin.
    const admin = await requireSuperAdmin(req, res);
    if (!admin) return;

    const view = req.query?.view;

    // =====================================
    // GET
    // =====================================
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

    // =====================================
    // PATCH
    // =====================================
    if (req.method === "PATCH") {
      if (view !== "manage") {
        return json(res, 400, {
          success: false,
          message: "Invalid management request."
        });
      }

      if (req.body?.order_id !== undefined) {
        return await updateOrder(
          req,
          res,
          admin
        );
      }

      if (
        req.body?.user_id !== undefined &&
        req.body?.role !== undefined
      ) {
        return await updateUserRole(
          req,
          res,
          admin
        );
      }

      if (
        req.body?.user_id !== undefined &&
        req.body?.status !== undefined
      ) {
        return await updateUserStatus(
          req,
          res,
          admin
        );
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
