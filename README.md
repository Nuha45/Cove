# Cove

Phase 1 of a small-business management app. The look follows the Vercel prototype. The running app is React, Express, and MongoDB.

The `_prototype` folder is only a visual reference. It uses Next.js and is not part of this app.

## Database

This app uses MongoDB Atlas. There is no local database to install.

1. Create a free cluster at [MongoDB Atlas](https://www.mongodb.com/atlas).
2. Create a database user and copy the driver connection string.
3. In Atlas Network Access, allow your current IP address.
4. Paste the string into `MONGODB_URI` in `server/.env`. Use the database name `cove`.

### Automated tests

Tests never use `MONGODB_URI`. They connect only to `TEST_MONGODB_URI`, a separate database whose
name contains `test` (use `cove_test`). Set it in `server/.env` (gitignored) or in the CI environment:

```bash
TEST_MONGODB_URI=mongodb+srv://TEST_USER:TEST_PASSWORD@CLUSTER.mongodb.net/cove_test?retryWrites=true&w=majority
```

- `npm test` stops immediately if `TEST_MONGODB_URI` is missing, has no database name, or points to the
  same database as `MONGODB_URI` (compared by host and database name, ignoring credentials and options).
- Best: a separate Atlas project or cluster, or a local `mongodb://127.0.0.1:27017/cove_test`.
  A `cove_test` database on the production cluster also works; give its Atlas user `readWrite` on
  `cove_test` only, so the test credentials cannot reach `cove`.
- Tests create and delete their own records and build indexes only in that database.
- CI: add `TEST_MONGODB_URI` as a secret and pass it as an environment variable to `npm test`. Never commit it.

## Run it

1. From this folder, after `server/.env` has your Atlas connection string:

```bash
npm run install:all
npm run dev
```

2. Open http://localhost:5173

The API runs at http://localhost:5000. In development, the React app sends `/api` requests to that server for you.

## What is included

- Register, login, logout, forgot/reset password, and "who am I"
- Passwords are hashed. The login token lives in an httpOnly cookie
- Password reset uses a hashed, single-use, time-limited token
- Each account gets its own business. Data requests are filtered by that business on the server
- Seller email + in-app notifications for orders, payments, and customer wants
- Dashboard shell matching the prototype navigation

## Email setup (optional)

Transactional email is optional. Without credentials, Cove still runs; password-reset and event emails are skipped (and logged in development).

1. Copy `server/.env.example` values into `server/.env`.
2. Set:
   - `EMAIL_PROVIDER=resend` (or `console` for local logging only)
   - `EMAIL_FROM=Cove <onboarding@resend.dev>` for Resend testing, or a sender on a domain you verified in Resend
   - `EMAIL_API_KEY=...` (Resend API key)
   - `APP_URL=http://localhost:5173` (frontend URL used in reset links)
3. Restart the API after every `.env` change (`npm run dev` in `server/`).
4. On startup you should see `[email-config] provider=resend apiKeyConfigured=true ...`.
5. Use **Forgot password** on the login page to send a reset email.

**Important:** A personal Gmail address is not a valid Resend `EMAIL_FROM` unless that domain is verified in Resend. Use `onboarding@resend.dev` for development, or verify your own domain.

If `EMAIL_PROVIDER=resend` and credentials are missing or Resend rejects the sender, Cove logs a clear error in development. It no longer silently falls back to console mode.

For automated tests, the server uses an in-memory email outbox (`EMAIL_PROVIDER=memory`) and never prints raw reset tokens.

Never commit real email API keys.

## Cove Admin (platform operators)

The private admin area lives at `/admin`. It is separate from seller dashboards, and every `/api/admin/*` request is checked on the server (logged-in session **and** `isPlatformAdmin` on the user record in MongoDB).

Nobody can become an admin through the app. Registration always creates a normal seller, and there is no API endpoint that grants admin access. To promote the Cove owner's existing account:

1. Register (or log in) normally with the owner's email so the account exists.
2. On a machine that has the production `server/.env` (with `MONGODB_URI`), run from the `server` folder:

```bash
node scripts/promote-admin.js owner@example.com
```

3. Log out and back in (or refresh). A **Cove Admin** link appears in the sidebar.

To remove admin access: `node scripts/promote-admin.js owner@example.com --revoke`. This takes effect on the next request because the server reloads the user on every call.

Keep database credentials limited to trusted operators. Anyone who can write to the database can change this flag.

## Deploying

Cove has two parts: a static React build (`client/dist`) and a Node API (`server`). Node 18.18+ is required.

```bash
npm run install:all
npm test          # backend tests (needs TEST_MONGODB_URI, see "Automated tests" below)
npm run build     # builds client/dist, including robots.txt
npm start         # starts the API (NODE_ENV=production in the host's env)
```

### Recommended layout

Serve the frontend and API from the same site so the login cookie is first-party, for example:

- One domain with a reverse proxy: `https://shop.yourdomain` serves `client/dist`, and forwards `/api/*` and `/uploads/*` to the API. Keep `VITE_API_URL=/api`.
- Or subdomains: `https://app.yourdomain` for the frontend, `https://api.yourdomain` for the API. Set `VITE_API_URL=https://api.yourdomain/api` and `COOKIE_SAME_SITE=lax`.

Completely different domains also work (the API defaults to `SameSite=None; Secure` cookies in production), but some browsers block third-party cookies, so logins may fail there.

The frontend host must rewrite unknown paths (for example `/store/<slug>` and `/dashboard`) to `index.html`.

### Server environment (host settings, not committed)

| Variable | Notes |
| --- | --- |
| `NODE_ENV` | `production` |
| `MONGODB_URI` | Atlas connection string. Allow the host's outbound IPs in Atlas Network Access |
| `JWT_SECRET` | New random value, 32+ characters |
| `CLIENT_ORIGIN` | Exact frontend origin(s), comma-separated. Required in production |
| `APP_URL` | Frontend URL used in password-reset emails (defaults to the first `CLIENT_ORIGIN`) |
| `TRUST_PROXY` | Proxy hops in front of the API. Defaults to `1` in production |
| `COOKIE_SAME_SITE` | `lax` for same-site layouts, otherwise leave unset |
| `PUBLIC_SITE_URL` | Public frontend origin. Turns on `/api/seo/sitemap.xml` |
| `RAZORPAY_*`, `EMAIL_*` | Optional features, same as in `server/.env.example` |

`GET /api/health` returns 200 when the database is connected and 503 otherwise; use it as the host health check. The API shuts down cleanly on `SIGTERM`.

### Client build variables (set before `npm run build`)

- `VITE_API_URL`: `/api` behind a proxy, or the full API URL.
- `VITE_APP_ORIGIN`: the public frontend origin. Used for share links, canonical URLs, and Open Graph URLs. Canonical tags are left out when it is missing or points at localhost.
- `VITE_SITEMAP_URL` (optional): full sitemap URL added to `robots.txt`, for example `https://shop.yourdomain/api/seo/sitemap.xml`.

### Uploads

Product, logo, and cover images are saved to `server/uploads` on local disk. Use a host with a persistent disk or volume mounted there, or images will disappear on redeploy.

### SEO

- Public storefront and product pages set their own title, description, canonical URL, Open Graph/Twitter tags, and JSON-LD (`Store` and `Product`) built from real shop data.
- Everything else (login, dashboard, admin, cart, checkout, order confirmation, request pages) is marked `noindex`.
- `robots.txt` is generated at build time and blocks seller and admin areas.
- The sitemap is served by the API at `/api/seo/sitemap.xml` once `PUBLIC_SITE_URL` is set. It lists live storefronts and active products.
- Metadata is set by JavaScript after the page loads. Google renders it, but some link-preview bots do not, so shared links may show the default Cove preview until server-side rendering or prerendering is added.
