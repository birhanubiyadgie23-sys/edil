import {
  sql,
  json,
  method,
  requireUser,
  requireSuperAdmin,
  audit
} from "../_db.js";

const MAX_BOOK_ID = 2147483647;
const MAX_CART_LINES = 50;
const MAX_QUANTITY_PER_BOOK = 20;

function parsePositiveInteger(value, maximum) {
  let number;

  if (typeof value === "number") {
    number = value;
  } else if (
    typeof value === "string" &&
    /^\d+$/.test(value.trim())
  ) {
    number = Number(value.trim());
  } else {
    return null;
  }

  if (
    !Number.isSafeInteger(number) ||
    number < 1 ||
    number > maximum
  ) {
    return null;
  }

  return number;
}

function safeText(value) {
  return String(value ?? "")
    .replace(/[\r\n]+/g, " ")
    .trim();
}

export default async function handler(req, res) {
  if (!method(req, res, ["GET", "POST"])) {
    return;
  }

  try {
    // =====================================
    // CREATE ORDER
    // POST /api/orders
    // =====================================
    if (req.method === "POST") {
      const user = await requireUser(req, res);
      if (!user) return;

      const items = req.body?.items;

      if (
        !Array.isArray(items) ||
        items.length < 1 ||
        items.length > MAX_CART_LINES
      ) {
        return json(res, 400, {
          success: false,
          message: "Your cart must contain between 1 and 50 items."
        });
      }

      // -------------------------------------
      // Validate and combine duplicate books.
      // -------------------------------------
      const quantities = new Map();

      for (const item of items) {
        if (
          !item ||
          typeof item !== "object" ||
          Array.isArray(item)
        ) {
          return json(res, 400, {
            success: false,
            message: "Invalid cart item."
          });
        }

        const id = parsePositiveInteger(
          item.id,
          MAX_BOOK_ID
        );

        const quantity = parsePositiveInteger(
          item.quantity === undefined ? 1 : item.quantity,
          MAX_QUANTITY_PER_BOOK
        );

        if (!id || !quantity) {
          return json(res, 400, {
            success: false,
            message: "Each book must have a valid ID and a quantity from 1 to 20."
          });
        }

        const combined =
          (quantities.get(id) || 0) + quantity;

        if (combined > MAX_QUANTITY_PER_BOOK) {
          return json(res, 400, {
            success: false,
            message: "The maximum quantity for one book is 20."
          });
        }

        quantities.set(id, combined);
      }

      const requestedItems = Array.from(
        quantities,
        ([id, quantity]) => ({
          id,
          quantity
        })
      );

      /*
       * ATOMIC INVENTORY + ORDER OPERATION
       *
       * 1. Convert the validated cart into database rows.
       * 2. Lock all requested book rows in ID order.
       * 3. Confirm every book is active and has enough stock.
       * 4. Reduce stock only if EVERY requested book passes.
       * 5. Insert the pending order only if EVERY stock update succeeds.
       *
       * All operations run in one PostgreSQL statement.
       * If the INSERT fails, the stock updates are rolled back
       * with the statement.
       */

      const rows = await sql`
        WITH requested AS MATERIALIZED (
          SELECT
            id,
            quantity
          FROM jsonb_to_recordset(
            ${JSON.stringify(requestedItems)}::jsonb
          ) AS item(
            id integer,
            quantity integer
          )
        ),

        locked AS MATERIALIZED (
          SELECT
            b.id,
            b.title,
            b.price,
            b.stock,
            b.active
          FROM books AS b
          INNER JOIN requested AS r
            ON r.id = b.id
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
          INNER JOIN locked AS l
            ON l.id = r.id
          WHERE
            l.active = TRUE
            AND l.stock >= r.quantity
            AND l.price IS NOT NULL
            AND l.price >= 0
        ),

        gate AS MATERIALIZED (
          SELECT
            COUNT(*) = (
              SELECT COUNT(*)
              FROM requested
            ) AS all_available
          FROM valid
        ),

        updated AS (
          UPDATE books AS b
          SET
            stock = b.stock - v.quantity,
            updated_at = NOW()
          FROM valid AS v
          CROSS JOIN gate AS g
          WHERE
            g.all_available = TRUE
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
            (
              SELECT COUNT(*)
              FROM updated
            ) = (
              SELECT COUNT(*)
              FROM requested
            )
          RETURNING
            id,
            total,
            status,
            items,
            created_at
        )

        SELECT
          id,
          total,
          status,
          items,
          created_at
        FROM created
      `;

      if (!rows.length) {
        return json(res, 409, {
          success: false,
          message: "One or more books are unavailable or do not have enough stock. Please refresh your cart and try again."
        });
      }

      const order = rows[0];

      // -------------------------------------
      // Audit order creation.
      // -------------------------------------
      await audit(
        user.id,
        "order.create",
        "order",
        order.id,
        {
          item_count: Array.isArray(order.items)
            ? order.items.length
            : 0,
          total: String(order.total)
        }
      );

      // -------------------------------------
      // Prepare Telegram notification.
      // -------------------------------------
      const configuredUsername = String(
        process.env.TELEGRAM_USERNAME || "Ychalal2"
      )
        .trim()
        .replace(/^@/, "");

      const telegramUsername =
        /^[A-Za-z0-9_]{5,32}$/.test(configuredUsername)
          ? configuredUsername
          : "Ychalal2";

      const itemLines = Array.isArray(order.items)
        ? order.items.map(item => {
            const title = safeText(item.title);
            const quantity = Number(item.quantity);
            const price = Number(item.price);

            return (
              `${title} x${quantity}: ` +
              `${(price * quantity).toFixed(2)} ETB`
            );
          })
        : [];

      const message = [
        `New DevStackReads order #${order.id}`,
        ...itemLines,
        `Total: ${Number(order.total).toFixed(2)} ETB`,
        `Customer: ${safeText(user.name)} (${safeText(user.email)})`,
        "Status: pending"
      ].join("\n");

      const telegramUrl =
        `https://t.me/${encodeURIComponent(telegramUsername)}` +
        `?text=${encodeURIComponent(message)}`;

      return json(res, 201, {
        success: true,
        order: {
          id: order.id,
          total: order.total,
          status: order.status,
          created_at: order.created_at
        },
        telegram_url: telegramUrl
      });
    }

    // =====================================
    // ADMIN: LIST ORDERS
    // GET /api/orders
    // Super Admin only because this response
    // includes customer personal information.
    // =====================================
    if (req.method === "GET") {
      const admin = await requireSuperAdmin(req, res);
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
