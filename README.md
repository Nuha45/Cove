# Cove

Phase 1 of a small-business management app. The look follows the Vercel prototype. The running app is React, Express, and MongoDB.

The `_prototype` folder is only a visual reference. It uses Next.js and is not part of this app.

## Database

This app uses MongoDB Atlas. There is no local database to install.

1. Create a free cluster at [MongoDB Atlas](https://www.mongodb.com/atlas).
2. Create a database user and copy the driver connection string.
3. In Atlas Network Access, allow your current IP address.
4. Paste the string into `MONGODB_URI` in `server/.env`. Use the database name `cove`.

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
   - `EMAIL_PROVIDER=resend` (or `console` / leave blank for local skip)
   - `EMAIL_FROM=Cove <onboarding@yourdomain.com>`
   - `EMAIL_API_KEY=...` (Resend API key)
   - `APP_URL=http://localhost:5173` (frontend URL used in reset links)
3. Restart the API.
4. Use **Forgot password** on the login page to send a reset email.

For automated tests, the server uses an in-memory email outbox (`EMAIL_PROVIDER=memory`) and never prints raw reset tokens.

Never commit real email API keys.