
import {
  sql,
  json,
  method,
  requireUser,
  requireAdmin,
  audit
} from "../_db.js";

export default async function handler(req, res) {
  if (!method(req, res, ["GET", "POST"])) {
    return;
  }

  try {
    // CREATE ORDER
    if (req.method === "POST") {
      const user = await requireUser(req, res);
      if (!user) return;

      const items = req.body?.items;

      if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
        return json(res, 400, {
          success: false,
          message: "Your cart must contain between 1 and 50 items."
        });
      }

      // Validate and combine duplicate book IDs.
      const quantities = new Map();

      for (const item of items) {
        if (!item || typeof item !== "object") {
          return json(res, 400, {
            success: false,
            message: "Invalid cart item."
          });
        }

        const id = Number(item.id);
        const quantity =
          item.quantity === undefined ? 1 : Number(item.quantity);

        if (
          !Number.isSafeInteger(id) ||
          id < 1 ||
          !Number.isSafeInteger(quantity) ||
          quantity < 1 ||
          quantity > 20
        ) {
          return json(res, 400, {
            success: false,
            message: "Each book must have a valid ID and a quantity from 1 to 20."
          });
        }

        const combined = (quantities.get(id) || 0) + quantity;

        if (combined > 20) {
          return json(res, 400, {
            success: false,
            message: "The maximum quantity for one book is 20."
          });
        }

        quantities.set(id, combined);
      }

      const requestedItems = Array.from(quantities, ([id, quantity]) => ({
        id,
        quantity
      }));

      /*
       * This is one atomic PostgreSQL statement:
       * - Locks requested book rows in ID order.
       * - Checks that every requested book exists, is active, and has stock.
       * - Decreases stock only when every item passes validation.
       * - Creates the order only when every stock update succeeded.
       *
       * If the order INSERT fails, PostgreSQL rolls back the stock updates too.
       */
      const rows = await sql`
        WITH requested AS MATERIALIZED (
          SELECT id, quantity
          FROM jsonb_to_recordset(
            ${JSON.stringify(requestedItems)}::jsonb
          ) AS item(id integer, quantity integer)
        ),
        locked AS MATERIALIZED (
          SELECT
            b.id,
            b.title,
            b.price,
            b.stock,
            b.active
          FROM books AS b
          INNER JOIN requested AS r ON r.id = b.id
          ORDER BY b.id
          FOR UPDATE OF b
        ),
        valid AS MATERIALIZED (
          SELECT
            r.id,
            r.quantity,
            l.title,
            l.price
          FROM requested AS r
          INNER JOIN locked AS l ON l.id = r.id
          WHERE l.active = TRUE
            AND l.stock >= r.quantity
        ),
        gate AS MATERIALIZED (
          SELECT
            COUNT(*) = (SELECT COUNT(*) FROM requested) AS all_available
          FROM valid
        ),
        updated AS (
          UPDATE books AS b
          SET
            stock = b.stock - v.quantity,
            updated_at = NOW()
          FROM valid AS v
          CROSS JOIN gate AS g
          WHERE g.all_available = TRUE
            AND b.id = v.id
          RETURNING b.id
        ),
        order_data AS (
          SELECT
            jsonb_agg(
              jsonb_build_object(
                'id', v.id,
                'title', v.title,
                'price', v.price,
                'quantity', v.quantity
              )
              ORDER BY v.id
            ) AS items,
            SUM(v.price * v.quantity) AS total
          FROM valid AS v
        ),
        created AS (
          INSERT INTO orders (
            user_id,
            customer_name,
            customer_email,
            items,
            total,
            status
          )
          SELECT
            ${user.id},
            ${user.name},
            ${user.email},
            d.items,
            d.total,
            'pending'
          FROM order_data AS d
          WHERE
            (SELECT COUNT(*) FROM updated) =
            (SELECT COUNT(*) FROM requested)
          RETURNING id, total, status, created_at
        )
        SELECT id, total, status, created_at
        FROM created
      `;

      if (!rows.length) {
        return json(res, 409, {
          success: false,
          message: "One or more books are unavailable or do not have enough stock."
        });
      }

      const order = rows[0];

      await audit(
        user.id,
        "order.create",
        "order",
        order.id
      );

      const username = String(
        process.env.TELEGRAM_USERNAME || "Ychalal2"
      ).replace(/^@/, "");

      const message = [
        `New DevStackReads order #${order.id}`,
        `Total: ${Number(order.total).toFixed(2)} ETB`,
        `Customer: ${user.name} (${user.email})`
      ].join("\n");

      const telegramUrl =
        `https://t.me/${encodeURIComponent(username)}` +
        `?text=${encodeURIComponent(message)}`;

      return json(res, 201, {
        success: true,
        order,
        telegram_url: telegramUrl
      });
    }

    // ADMIN: LIST ORDERS
    if (req.method === "GET") {
      const admin = await requireAdmin(req, res);
      if (!admin) return;

      const orders = await sql`
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
        LIMIT 500
      `;

      return json(res, 200, {
        success: true,
        orders
      });
    }
  } catch (error) {
    console.error("Orders API error:", error);

    return json(res, 500, {
      success: false,
      message: "Order operation failed."
    });
  }
}
