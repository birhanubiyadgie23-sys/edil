
import {
  sql,
  json,
  method,
  requireAdmin,
  audit
} from "../_db.js";

function isValidPrice(value) {
  return (
    Number.isFinite(value) &&
    value >= 0 &&
    Math.abs(value * 100 - Math.round(value * 100)) < 1e-8
  );
}

function parseImageUrl(value) {
  if (value === null || value === "") {
    return { valid: true, value: null };
  }

  if (typeof value !== "string" || value.length > 2048) {
    return { valid: false };
  }

  const image = value.trim();

  if (
    !image ||
    /^(https?:\/\/|\/|\.\/|\.\.\/)/i.test(image)
  ) {
    return { valid: true, value: image || null };
  }

  return { valid: false };
}

export default async function handler(req, res) {
  if (!method(req, res, ["GET", "POST", "PUT", "PATCH", "DELETE"])) {
    return;
  }

  try {
    // GET BOOKS
    if (req.method === "GET") {
      const isAdminRequest = req.query?.admin === "1";

      if (isAdminRequest) {
        const admin = await requireAdmin(req, res);
        if (!admin) return;
      }

      let books;

      if (isAdminRequest) {
        books = await sql`
          SELECT
            id,
            title,
            author,
            price,
            image_url,
            description,
            stock,
            active,
            created_at,
            updated_at
          FROM books
          ORDER BY created_at DESC
        `;
      } else {
        books = await sql`
          SELECT
            id,
            title,
            author,
            price,
            image_url,
            description,
            stock,
            active,
            created_at,
            updated_at
          FROM books
          WHERE active = TRUE
          ORDER BY created_at DESC
        `;
      }

      return json(res, 200, {
        success: true,
        books
      });
    }

    // ALL WRITE OPERATIONS REQUIRE ADMIN
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const body =
      req.body && typeof req.body === "object" && !Array.isArray(req.body)
        ? req.body
        : {};

    // CREATE BOOK
    if (req.method === "POST") {
      const title = String(body.title || "").trim();
      const author = String(body.author || "").trim();
      const description = String(body.description || "");
      const price = Number(body.price ?? 0);
      const stock = Number(body.stock ?? 0);
      const imageResult = parseImageUrl(body.image_url ?? null);

      if (!title || title.length > 200) {
        return json(res, 400, {
          success: false,
          message: "Book title is required and must be under 200 characters."
        });
      }

      if (!author || author.length > 200) {
        return json(res, 400, {
          success: false,
          message: "Author is required and must be under 200 characters."
        });
      }

      if (!isValidPrice(price)) {
        return json(res, 400, {
          success: false,
          message: "Enter a valid non-negative price with up to two decimal places."
        });
      }

      if (
        !Number.isSafeInteger(stock) ||
        stock < 0 ||
        stock > 1000000
      ) {
        return json(res, 400, {
          success: false,
          message: "Stock must be a whole number between 0 and 1,000,000."
        });
      }

      if (description.length > 10000 || !imageResult.valid) {
        return json(res, 400, {
          success: false,
          message: "Description or image URL is invalid or too long."
        });
      }

      const rows = await sql`
        INSERT INTO books (
          title,
          author,
          price,
          image_url,
          description,
          stock,
          active,
          updated_at
        )
        VALUES (
          ${title},
          ${author},
          ${price},
          ${imageResult.value},
          ${description},
          ${stock},
          TRUE,
          NOW()
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
        book: rows[0]
      });
    }

    // UPDATE OR RESTORE BOOK
    if (req.method === "PUT" || req.method === "PATCH") {
      const id = Number(req.query?.id ?? body.id);

      if (!Number.isSafeInteger(id) || id < 1) {
        return json(res, 400, {
          success: false,
          message: "A valid book ID is required."
        });
      }

      const fields = [
        "title",
        "author",
        "price",
        "image_url",
        "description",
        "stock",
        "active"
      ];

      const has = {};
      for (const field of fields) {
        has[field] = Object.prototype.hasOwnProperty.call(body, field);
      }

      if (!fields.some(field => has[field])) {
        return json(res, 400, {
          success: false,
          message: "No book fields were provided for update."
        });
      }

      let title = null;
      let author = null;
      let price = null;
      let imageUrl = null;
      let description = null;
      let stock = null;
      let active = null;

      if (has.title) {
        title = String(body.title || "").trim();
        if (!title || title.length > 200) {
          return json(res, 400, {
            success: false,
            message: "Book title is invalid."
          });
        }
      }

      if (has.author) {
        author = String(body.author || "").trim();
        if (!author || author.length > 200) {
          return json(res, 400, {
            success: false,
            message: "Author is invalid."
          });
        }
      }

      if (has.price) {
        price = Number(body.price);
        if (!isValidPrice(price)) {
          return json(res, 400, {
            success: false,
            message: "Book price is invalid."
          });
        }
      }

      if (has.image_url) {
        const imageResult = parseImageUrl(body.image_url);
        if (!imageResult.valid) {
          return json(res, 400, {
            success: false,
            message: "Image URL is invalid."
          });
        }
        imageUrl = imageResult.value;
      }

      if (has.description) {
        if (
          typeof body.description !== "string" ||
          body.description.length > 10000
        ) {
          return json(res, 400, {
            success: false,
            message: "Book description is invalid or too long."
          });
        }
        description = body.description;
      }

      if (has.stock) {
        stock = Number(body.stock);
        if (
          !Number.isSafeInteger(stock) ||
          stock < 0 ||
          stock > 1000000
        ) {
          return json(res, 400, {
            success: false,
            message: "Stock must be a whole number between 0 and 1,000,000."
          });
        }
      }

      if (has.active) {
        if (typeof body.active !== "boolean") {
          return json(res, 400, {
            success: false,
            message: "Active must be true or false."
          });
        }
        active = body.active;
      }

      const rows = await sql`
        UPDATE books
        SET
          title = CASE WHEN ${has.title} THEN ${title} ELSE title END,
          author = CASE WHEN ${has.author} THEN ${author} ELSE author END,
          price = CASE WHEN ${has.price} THEN ${price} ELSE price END,
          image_url = CASE WHEN ${has.image_url} THEN ${imageUrl} ELSE image_url END,
          description = CASE WHEN ${has.description} THEN ${description} ELSE description END,
          stock = CASE WHEN ${has.stock} THEN ${stock} ELSE stock END,
          active = CASE WHEN ${has.active} THEN ${active} ELSE active END,
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
        rows[0].active ? "book.update" : "book.archive",
        "book",
        id
      );

      return json(res, 200, {
        success: true,
        book: rows[0]
      });
    }

    // ARCHIVE BOOK (SOFT DELETE)
    if (req.method === "DELETE") {
      const id = Number(req.query?.id ?? body.id);

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
          AND active = TRUE
        RETURNING id
      `;

      if (!rows.length) {
        return json(res, 404, {
          success: false,
          message: "Book not found or already archived."
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
