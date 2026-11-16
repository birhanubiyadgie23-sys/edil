import {
  sql,
  json,
  method,
  requireAdmin,
  audit
} from "../_db.js";

const MAX_BOOK_ID = 2147483647;
const MAX_STOCK = 1000000;
const MAX_TEXT_LENGTH = 10000;

function parseId(value) {
  let id;

  if (typeof value === "number") {
    id = value;
  } else if (
    typeof value === "string" &&
    /^[1-9]\d*$/.test(value.trim())
  ) {
    id = Number(value.trim());
  } else {
    return null;
  }

  if (
    !Number.isSafeInteger(id) ||
    id < 1 ||
    id > MAX_BOOK_ID
  ) {
    return null;
  }

  return id;
}

function parseStock(value) {
  let stock;

  if (typeof value === "number") {
    stock = value;
  } else if (
    typeof value === "string" &&
    /^\d+$/.test(value.trim())
  ) {
    stock = Number(value.trim());
  } else {
    return null;
  }

  if (
    !Number.isSafeInteger(stock) ||
    stock < 0 ||
    stock > MAX_STOCK
  ) {
    return null;
  }

  return stock;
}

function parsePrice(value) {
  let price;

  if (typeof value === "number") {
    price = value;
  } else if (
    typeof value === "string" &&
    /^\d+(?:\.\d{1,2})?$/.test(value.trim())
  ) {
    price = Number(value.trim());
  } else {
    return null;
  }

  if (
    !Number.isFinite(price) ||
    price < 0 ||
    !Number.isSafeInteger(Math.round(price * 100)) ||
    Math.abs(price * 100 - Math.round(price * 100)) > 0.0000001
  ) {
    return null;
  }

  return price;
}

function parseImageUrl(value) {
  if (value === null || value === "") {
    return {
      valid: true,
      value: null
    };
  }

  if (
    typeof value !== "string" ||
    value.length > 2048
  ) {
    return { valid: false };
  }

  const image = value.trim();

  if (
    !image ||
    /[\u0000-\u001F\u007F\\]/.test(image)
  ) {
    return { valid: false };
  }

  // Allow safe local paths.
  if (
    image.startsWith("/") &&
    !image.startsWith("//")
  ) {
    return {
      valid: true,
      value: image
    };
  }

  if (
    image.startsWith("./") ||
    image.startsWith("../")
  ) {
    return {
      valid: true,
      value: image
    };
  }

  // Allow only normal HTTP/HTTPS URLs.
  try {
    const parsed = new URL(image);

    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password
    ) {
      return { valid: false };
    }

    return {
      valid: true,
      value: parsed.toString()
    };
  } catch {
    return { valid: false };
  }
}

function getRequestBody(req) {
  if (
    req.body &&
    typeof req.body === "object" &&
    !Array.isArray(req.body)
  ) {
    return req.body;
  }

  return {};
}

export default async function handler(req, res) {
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

  try {
    // =====================================
    // GET BOOKS
    // Public: active books only
    // Admin: all books
    // =====================================
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
          ORDER BY created_at DESC, id DESC
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
          ORDER BY created_at DESC, id DESC
        `;
      }

      return json(res, 200, {
        success: true,
        books
      });
    }

    // =====================================
    // ALL WRITE OPERATIONS REQUIRE ADMIN
    // =====================================
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const body = getRequestBody(req);

    // =====================================
    // CREATE BOOK
    // =====================================
    if (req.method === "POST") {
      const title =
        typeof body.title === "string"
          ? body.title.trim()
          : "";

      const author =
        typeof body.author === "string"
          ? body.author.trim()
          : "";

      const description =
        body.description === undefined
          ? ""
          : body.description;

      const price = parsePrice(
        body.price === undefined ? 0 : body.price
      );

      const stock = parseStock(
        body.stock === undefined ? 0 : body.stock
      );

      const imageResult = parseImageUrl(
        body.image_url === undefined
          ? null
          : body.image_url
      );

      if (!title || title.length > 200) {
        return json(res, 400, {
          success: false,
          message: "Book title is required and must not exceed 200 characters."
        });
      }

      if (!author || author.length > 200) {
        return json(res, 400, {
          success: false,
          message: "Author is required and must not exceed 200 characters."
        });
      }

      if (price === null) {
        return json(res, 400, {
          success: false,
          message: "Enter a valid non-negative price with up to two decimal places."
        });
      }

      if (stock === null) {
        return json(res, 400, {
          success: false,
          message: "Stock must be a whole number between 0 and 1,000,000."
        });
      }

      if (
        typeof description !== "string" ||
        description.length > MAX_TEXT_LENGTH ||
        !imageResult.valid
      ) {
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
        RETURNING
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

    // =====================================
    // UPDATE OR RESTORE BOOK
    // PUT/PATCH /api/books?id=BOOK_ID
    // =====================================
    if (
      req.method === "PUT" ||
      req.method === "PATCH"
    ) {
      const id = parseId(
        req.query?.id ?? body.id
      );

      if (!id) {
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
        has[field] = Object.prototype.hasOwnProperty.call(
          body,
          field
        );
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
        if (typeof body.title !== "string") {
          return json(res, 400, {
            success: false,
            message: "Book title must be text."
          });
        }

        title = body.title.trim();

        if (!title || title.length > 200) {
          return json(res, 400, {
            success: false,
            message: "Book title must not exceed 200 characters and cannot be empty."
          });
        }
      }

      if (has.author) {
        if (typeof body.author !== "string") {
          return json(res, 400, {
            success: false,
            message: "Author must be text."
          });
        }

        author = body.author.trim();

        if (!author || author.length > 200) {
          return json(res, 400, {
            success: false,
            message: "Author must not exceed 200 characters and cannot be empty."
          });
        }
      }

      if (has.price) {
        price = parsePrice(body.price);

        if (price === null) {
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
          body.description.length > MAX_TEXT_LENGTH
        ) {
          return json(res, 400, {
            success: false,
            message: "Book description is invalid or too long."
          });
        }

        description = body.description;
      }

      if (has.stock) {
        stock = parseStock(body.stock);

        if (stock === null) {
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

      /*
       * Lock the current book row before updating it.
       * This also lets us distinguish restore/archive/update
       * correctly in the audit log.
       */
      const rows = await sql`
        WITH current_book AS MATERIALIZED (
          SELECT active
          FROM books
          WHERE id = ${id}
          FOR UPDATE
        ),
        updated AS (
          UPDATE books AS b
          SET
            title = CASE
              WHEN ${has.title} THEN ${title}
              ELSE b.title
            END,

            author = CASE
              WHEN ${has.author} THEN ${author}
              ELSE b.author
            END,

            price = CASE
              WHEN ${has.price} THEN ${price}
              ELSE b.price
            END,

            image_url = CASE
              WHEN ${has.image_url} THEN ${imageUrl}
              ELSE b.image_url
            END,

            description = CASE
              WHEN ${has.description} THEN ${description}
              ELSE b.description
            END,

            stock = CASE
              WHEN ${has.stock} THEN ${stock}
              ELSE b.stock
            END,

            active = CASE
              WHEN ${has.active} THEN ${active}
              ELSE b.active
            END,

            updated_at = NOW()

          FROM current_book AS previous

          WHERE b.id = ${id}

          RETURNING
            b.id,
            b.title,
            b.author,
            b.price,
            b.image_url,
            b.description,
            b.stock,
            b.active,
            b.created_at,
            b.updated_at
        )
        SELECT
          updated.*,
          current_book.active AS previous_active
        FROM updated
        CROSS JOIN current_book
      `;

      if (!rows.length) {
        return json(res, 404, {
          success: false,
          message: "Book not found."
        });
      }

      const book = rows[0];

      let auditAction = "book.update";

      if (
        book.previous_active === false &&
        book.active === true
      ) {
        auditAction = "book.restore";
      } else if (
        book.previous_active === true &&
        book.active === false
      ) {
        auditAction = "book.archive";
      }

      await audit(
        admin.id,
        auditAction,
        "book",
        id
      );

      delete book.previous_active;

      return json(res, 200, {
        success: true,
        book
      });
    }

    // =====================================
    // ARCHIVE BOOK
    // SOFT DELETE - NEVER PHYSICALLY DELETE
    // =====================================
    if (req.method === "DELETE") {
      const id = parseId(
        req.query?.id ?? body.id
      );

      if (!id) {
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
