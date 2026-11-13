
import {
  sql,
  json,
  method,
  requireAdmin,
  audit
} from "../_db.js";

export default async function handler(req, res) {
  try {
    // =====================================
    // CHECK HTTP METHOD
    // =====================================

    if (
      !method(req, res, [
        "GET",
        "POST",
        "PUT",
        "PATCH",
        "DELETE"
      ])
    ) {
      return;
    }

    // =====================================
    // GET ACTIVE BOOKS
    // GET /api/books
    // =====================================

    if (req.method === "GET") {
      const books = await sql`
        SELECT
          id,
          title,
          author,
          price,
          image_url,
          description,
          stock,
          active,
          created_at
        FROM books
        WHERE active = TRUE
        ORDER BY created_at DESC
      `;

      return json(res, 200, {
        success: true,
        books
      });
    }

    // =====================================
    // ADMIN AUTHENTICATION
    // =====================================

    const admin = await requireAdmin(req, res);
    if (!admin) return;

    // =====================================
    // CREATE BOOK
    // POST /api/books
    // =====================================

    if (req.method === "POST") {
      const b = req.body || {};

      const title = String(b.title || "").trim();
      const author = String(b.author || "").trim();
      const price = Number(b.price);

      const stock = b.stock === undefined
        ? 0
        : Number(b.stock);

      if (!title || !author) {
        return json(res, 400, {
          success: false,
          message: "Book title and author are required."
        });
      }

      if (!Number.isFinite(price) || price < 0) {
        return json(res, 400, {
          success: false,
          message: "Book price must be a valid non-negative number."
        });
      }

      if (!Number.isSafeInteger(stock) || stock < 0) {
        return json(res, 400, {
          success: false,
          message: "Stock must be a non-negative whole number."
        });
      }

      const imageUrl = b.image_url
        ? String(b.image_url).trim()
        : null;

      const description = String(
        b.description || ""
      ).trim();

      const rows = await sql`
        INSERT INTO books (
          title,
          author,
          price,
          image_url,
          description,
          stock,
          active
        )
        VALUES (
          ${title},
          ${author},
          ${price},
          ${imageUrl},
          ${description},
          ${stock},
          TRUE
        )
        RETURNING *
      `;

      await audit(
        admin.id,
        "book.create",
        "book",
        rows[0].id
      );

      return json(res, 201, {
        success: true,
        book: rows[0],
        message: "Book created successfully."
      });
    }

    // =====================================
    // UPDATE BOOK
    // PUT /api/books
    // PATCH /api/books
    // =====================================

    if (
      req.method === "PUT" ||
      req.method === "PATCH"
    ) {
      const b = req.body || {};
      const id = Number(b.id);

      if (!Number.isSafeInteger(id) || id < 1) {
        return json(res, 400, {
          success: false,
          message: "A valid book ID is required."
        });
      }

      let price = null;
      let stock = null;
      let active = null;

      if (b.price !== undefined) {
        price = Number(b.price);

        if (!Number.isFinite(price) || price < 0) {
          return json(res, 400, {
            success: false,
            message: "Invalid book price."
          });
        }
      }

      if (b.stock !== undefined) {
        stock = Number(b.stock);

        if (
          !Number.isSafeInteger(stock) ||
          stock < 0
        ) {
          return json(res, 400, {
            success: false,
            message: "Invalid book stock."
          });
        }
      }

      if (b.active !== undefined) {
        if (typeof b.active !== "boolean") {
          return json(res, 400, {
            success: false,
            message: "Active must be true or false."
          });
        }

        active = b.active;
      }

      const title = b.title === undefined
        ? null
        : String(b.title).trim();

      const author = b.author === undefined
        ? null
        : String(b.author).trim();

      const description = b.description === undefined
        ? null
        : String(b.description);

      const imageUrl = b.image_url === undefined
        ? null
        : (b.image_url ? String(b.image_url).trim() : null);

      if (title !== null && !title) {
        return json(res, 400, {
          success: false,
          message: "Book title cannot be empty."
        });
      }

      if (author !== null && !author) {
        return json(res, 400, {
          success: false,
          message: "Book author cannot be empty."
        });
      }

      const rows = await sql`
        UPDATE books
        SET
          title = COALESCE(${title}, title),
          author = COALESCE(${author}, author),
          price = COALESCE(${price}, price),

          image_url = CASE
            WHEN ${b.image_url === undefined}
            THEN image_url
            ELSE ${imageUrl}
          END,

          description = COALESCE(${description}, description),
          stock = COALESCE(${stock}, stock),
          active = COALESCE(${active}, active),
          updated_at = NOW()

        WHERE id = ${id}
        RETURNING *
      `;

      if (!rows.length) {
        return json(res, 404, {
          success: false,
          message: "Book not found."
        });
      }

      await audit(
        admin.id,
        "book.update",
        "book",
        id
      );

      return json(res, 200, {
        success: true,
        book: rows[0],
        message: "Book updated successfully."
      });
    }

    // =====================================
    // ARCHIVE BOOK
    // DELETE /api/books
    // =====================================

    if (req.method === "DELETE") {
      const id = Number(req.body?.id);

      if (!Number.isSafeInteger(id) || id < 1) {
        return json(res, 400, {
          success: false,
          message: "A valid book ID is required."
        });
      }

      const rows = await sql`
        UPDATE books
        SET
          active = FALSE,
          updated_at = NOW()
        WHERE id = ${id}
        RETURNING id
      `;

      if (!rows.length) {
        return json(res, 404, {
          success: false,
          message: "Book not found."
        });
      }

      await audit(
        admin.id,
        "book.archive",
        "book",
        id
      );

      return json(res, 200, {
        success: true,
        message: "Book archived successfully."
      });
    }

  } catch (error) {
    console.error("Books API error:", error);

    return json(res, 500, {
      success: false,
      message: "Book operation failed."
    });
  }
}
