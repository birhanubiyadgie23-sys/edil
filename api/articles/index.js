
import {
  sql,
  json,
  requireAdmin,
  audit
} from "./_db.js";

export default async function handler(req, res) {
  try {
    // ==============================
    // GET ARTICLES
    // Public: /api/articles
    // Admin:  /api/articles?admin=1
    // ==============================

    if (req.method === "GET") {
      const isAdminRequest = req.query?.admin === "1";

      if (isAdminRequest) {
        const admin = await requireAdmin(req, res);
        if (!admin) return;

        const articles = await sql`
          SELECT
            id,
            title,
            author,
            category,
            excerpt,
            content,
            image_url,
            active,
            CASE
              WHEN active = TRUE THEN 'published'
              ELSE 'draft'
            END AS status,
            created_at,
            updated_at
          FROM articles
          ORDER BY created_at DESC
        `;

        return json(res, 200, {
          success: true,
          articles
        });
      }

      // Public users see only active articles.
      const articles = await sql`
        SELECT
          id,
          title,
          author,
          category,
          excerpt,
          content,
          image_url,
          active,
          created_at
        FROM articles
        WHERE active = TRUE
        ORDER BY created_at DESC
      `;

      return json(res, 200, {
        success: true,
        articles
      });
    }

    // ==============================
    // ADMIN AUTHENTICATION
    // ==============================

    if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
      res.setHeader(
        "Allow",
        "GET, POST, PUT, PATCH, DELETE"
      );

      return json(res, 405, {
        success: false,
        message: "Method not allowed."
      });
    }

    const admin = await requireAdmin(req, res);
    if (!admin) return;

    // ==============================
    // CREATE ARTICLE
    // ==============================

    if (req.method === "POST") {
      const b = req.body || {};

      const title = String(b.title || "").trim();
      const content = String(b.content || "").trim();

      if (!title || !content) {
        return json(res, 400, {
          success: false,
          message: "Title and article content are required."
        });
      }

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

      const active = b.status === "published";

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
          status: rows[0].active ? "published" : "draft"
        }
      });
    }

    // ==============================
    // UPDATE ARTICLE
    // ==============================

    if (req.method === "PUT" || req.method === "PATCH") {
      const b = req.body || {};
      const id = Number(b.id);

      if (!Number.isSafeInteger(id) || id < 1) {
        return json(res, 400, {
          success: false,
          message: "A valid article ID is required."
        });
      }

      let active = null;

      if (b.status === "published") {
        active = true;
      } else if (b.status === "draft") {
        active = false;
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

      const rows = await sql`
        UPDATE articles
        SET
          title = COALESCE(${title}, title),
          author = COALESCE(${author}, author),
          category = COALESCE(${category}, category),
          excerpt = COALESCE(${excerpt}, excerpt),
          content = COALESCE(${content}, content),

          image_url = CASE
            WHEN ${b.image_url === undefined}
            THEN image_url
            ELSE ${imageUrl}
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
        }
      });
    }

    // ==============================
    // DELETE ARTICLE
    // ==============================

    if (req.method === "DELETE") {
      const id = Number(req.body?.id);

      if (!Number.isSafeInteger(id) || id < 1) {
        return json(res, 400, {
          success: false,
          message: "A valid article ID is required."
        });
      }

      const rows = await sql`
        DELETE FROM articles
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
        "article.delete",
        "article",
        id
      );

      return json(res, 200, {
        success: true,
        message: "Article deleted successfully."
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
