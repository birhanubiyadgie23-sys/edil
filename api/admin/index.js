
import {
  sql,
  json,
  method,
  requireAdmin,
  audit
} from "../_db.js";

export default async function handler(req, res) {
  if (!method(req, res, ["GET", "POST", "PUT", "PATCH", "DELETE"])) {
    return;
  }

  try {
    // =====================================
    // GET ARTICLES
    // Public: GET /api/articles
    // Admin:  GET /api/articles?admin=1
    // =====================================

    if (req.method === "GET") {
      const isAdminRequest = req.query?.admin === "1";

      if (isAdminRequest) {
        const admin = await requireAdmin(req, res);
        if (!admin) return;

        const articles = await sql`
          SELECT
            id, title, author, category, excerpt,
            content, image_url, active,
            CASE WHEN active = TRUE
              THEN 'published' ELSE 'draft'
            END AS status,
            created_at, updated_at
          FROM articles
          ORDER BY created_at DESC
        `;

        return json(res, 200, {
          success: true,
          articles
        });
      }

      const articles = await sql`
        SELECT
          id, title, author, category, excerpt,
          content, image_url, active, created_at
        FROM articles
        WHERE active = TRUE
        ORDER BY created_at DESC
      `;

      return json(res, 200, {
        success: true,
        articles
      });
    }

    // =====================================
    // ADMIN AUTHENTICATION
    // =====================================

    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const b = req.body || {};

    // =====================================
    // CREATE ARTICLE
    // POST /api/articles
    // =====================================

    if (req.method === "POST") {
      const title = String(b.title || "").trim();
      const content = String(b.content || "").trim();

      const author = String(
        b.author || admin.name || "Admin"
      ).trim();

      const category = String(
        b.category || "General"
      ).trim();

      const excerpt = String(b.excerpt || "").trim();

      const imageUrl = b.image_url
        ? String(b.image_url).trim()
        : null;

      const status = b.status || "draft";

      if (!title || !content || !author || !category) {
        return json(res, 400, {
          success: false,
          message: "Title, author, category and content are required."
        });
      }

      if (!["draft", "published"].includes(status)) {
        return json(res, 400, {
          success: false,
          message: "Invalid article status."
        });
      }

      const active = status === "published";

      const rows = await sql`
        INSERT INTO articles (
          title,
          author,
          category,
          excerpt,
          content,
          image_url,
          active
        )
        VALUES (
          ${title},
          ${author},
          ${category},
          ${excerpt},
          ${content},
          ${imageUrl},
          ${active}
        )
        RETURNING *
      `;

      await audit(
        admin.id,
        "article.create",
        "article",
        rows[0].id
      );

      return json(res, 201, {
        success: true,
        article: {
          ...rows[0],
          status: active ? "published" : "draft"
        },
        message: "Article created successfully."
      });
    }

    // =====================================
    // UPDATE ARTICLE / CHANGE STATUS
    // PUT or PATCH /api/articles
    // =====================================

    if (req.method === "PUT" || req.method === "PATCH") {
      const id = Number(b.id);

      if (!Number.isSafeInteger(id) || id < 1) {
        return json(res, 400, {
          success: false,
          message: "A valid article ID is required."
        });
      }

      if (
        b.status !== undefined &&
        !["draft", "published"].includes(b.status)
      ) {
        return json(res, 400, {
          success: false,
          message: "Invalid article status."
        });
      }

      const requiredFields = [
        "title",
        "author",
        "category"
      ];

      for (const field of requiredFields) {
        if (
          b[field] !== undefined &&
          !String(b[field]).trim()
        ) {
          return json(res, 400, {
            success: false,
            message: `${field} cannot be empty.`
          });
        }
      }

      if (
        b.content !== undefined &&
        !String(b.content).trim()
      ) {
        return json(res, 400, {
          success: false,
          message: "Article content cannot be empty."
        });
      }

      const title = b.title === undefined
        ? null
        : String(b.title).trim();

      const author = b.author === undefined
        ? null
        : String(b.author).trim();

      const category = b.category === undefined
        ? null
        : String(b.category).trim();

      const excerpt = b.excerpt === undefined
        ? null
        : String(b.excerpt);

      const content = b.content === undefined
        ? null
        : String(b.content);

      const imageUrl = b.image_url === undefined
        ? null
        : (b.image_url ? String(b.image_url).trim() : null);

      const active = b.status === undefined
        ? null
        : b.status === "published";

      const rows = await sql`
        UPDATE articles
        SET
          title = COALESCE(${title}, title),
          author = COALESCE(${author}, author),
          category = COALESCE(${category}, category),
          excerpt = COALESCE(${excerpt}, excerpt),
          content = COALESCE(${content}, content),

          image_url = CASE
            WHEN ${b.image_url !== undefined}
            THEN ${imageUrl}
            ELSE image_url
          END,

          active = COALESCE(${active}, active),
          updated_at = NOW()

        WHERE id = ${id}
        RETURNING *
      `;

      if (!rows.length) {
        return json(res, 404, {
          success: false,
          message: "Article not found."
        });
      }

      await audit(
        admin.id,
        "article.update",
        "article",
        id
      );

      return json(res, 200, {
        success: true,
        article: {
          ...rows[0],
          status: rows[0].active ? "published" : "draft"
        },
        message: "Article updated successfully."
      });
    }

    // =====================================
    // ARCHIVE ARTICLE
    // DELETE /api/articles
    // Preserve existing database record.
    // =====================================

    if (req.method === "DELETE") {
      const id = Number(b.id);

      if (!Number.isSafeInteger(id) || id < 1) {
        return json(res, 400, {
          success: false,
          message: "A valid article ID is required."
        });
      }

      const rows = await sql`
        UPDATE articles
        SET
          active = FALSE,
          updated_at = NOW()
        WHERE id = ${id}
        RETURNING id
      `;

      if (!rows.length) {
        return json(res, 404, {
          success: false,
          message: "Article not found."
        });
      }

      await audit(
        admin.id,
        "article.archive",
        "article",
        id
      );

      return json(res, 200, {
        success: true,
        message: "Article archived successfully."
      });
    }

  } catch (error) {
    console.error("Articles API error:", error);

    return json(res, 500, {
      success: false,
      message: "Article operation failed."
    });
  }
}
