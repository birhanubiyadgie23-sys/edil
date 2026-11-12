# DevStackReads — Vercel + Neon

## Included
- Original storefront layout and Three.js hero are retained.
- Neon PostgreSQL API using Vercel Serverless Functions.
- Cookie-based sessions (HttpOnly, SameSite=Lax); no localStorage authentication.
- Admin Control Center: articles, books, orders, users/roles, events, newsletter, site settings, audit logs, overview.
- Public registration/login, book catalog, cart in memory, database-backed order creation and Telegram checkout link.

## Deploy
1. Create a Neon PostgreSQL project and copy its pooled connection string.
2. Push this folder to a Git repository and import it into Vercel.
3. In Vercel → Project → Settings → Environment Variables, add:
   - `DATABASE_URL`
   - `SESSION_SECRET` (long random value; reserved for future signing/rotation)
   - `ADMIN_EMAIL`
   - `ADMIN_PASSWORD` (long unique password)
   - `TELEGRAM_USERNAME` (optional)
4. Deploy.
5. Once, call `POST https://YOUR-DOMAIN/api/setup` to create database tables and the first admin account.
6. **Important:** after setup, remove `api/setup.js` from the project and redeploy, or protect this endpoint with a one-time setup secret before production use.
7. Open `/admin.html` and sign in using `ADMIN_EMAIL` and `ADMIN_PASSWORD`.

## Important notes
- Never put Neon credentials in frontend JavaScript or commit `.env`.
- Admin-only API routes enforce role checks on the server; hiding the admin page is not security.
- Public `GET /api/articles` returns published articles only. Admin editor uses authenticated writes.
- This starter stores order records before opening Telegram. It does not verify a payment or mark orders paid automatically.
- Newsletter subscriptions are stored in Neon; sending email campaigns requires an email provider integration.
- Image URL fields store external URLs. Uploading files requires a storage provider.
- Back up your Neon database before production use.
- The setup route should be removed/protected immediately after the first successful setup.
