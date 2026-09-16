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

- Register, login, logout, and "who am I"
- Passwords are hashed. The login token lives in an httpOnly cookie
- Each account gets its own business. Data requests are filtered by that business on the server
- Dashboard shell matching the prototype navigation

Products, orders, payments, and the public shop are not built yet.
