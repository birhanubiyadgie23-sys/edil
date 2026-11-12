# DevStackReads — Neon PostgreSQL edition

## Requirements
- Node.js 20+
- A Neon PostgreSQL project

## Setup
1. In Neon Console, open your project and choose **Connect**.
2. Copy the **pooled** PostgreSQL connection string.
3. Copy `.env.example` to `.env` and fill in `DATABASE_URL` and `SESSION_SECRET`.
4. Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` to create the first administrator. Use a unique password of at least 12 characters.
5. Install and start:

   ```bash
   npm install
   npm start
   ```

6. Open `http://localhost:3000`.

The server creates the required tables and inserts sample products on first start.

## Files
- `index.html`, `admin.html`: pages
- `css/style.css`: styling
- `js/app.js`: authentication and admin form behavior
- `js/store.js`: product display and in-memory cart UI
- `server.js`: API, sessions, authorization and Neon database access

## Important
- No application data or login session is stored in browser `localStorage`. The cart is held in page memory until checkout. Users, products, orders, order items and server sessions are stored in PostgreSQL.
- The database connection string stays on the server in `.env`; never put it in browser JavaScript or commit `.env`.
- This implementation records orders; it does not process payments or send Telegram messages.
- Deploy the Node server over HTTPS and set environment variables in the hosting provider. Set `NODE_ENV=production`.
