# personal-task-tracker-backend

REST API for the Personal Task Tracker, built with **Express 5**, **TypeScript**, and **Mongoose**.

## Requirements

- Node.js >= 20 (developed on 24)
- A MongoDB instance (local install, Docker, or MongoDB Atlas)

## Getting started

```bash
npm install
cp .env.example .env   # then edit MONGODB_URI
npm run dev
```

The API is served at `http://localhost:4000/api/v1`.

```bash
curl http://localhost:4000/api/v1/health
```

### Getting a MongoDB

Neither MongoDB nor Docker is installed on this machine yet. Pick one:

- **Atlas (no install):** create a free cluster at <https://cloud.mongodb.com>, then set
  `MONGODB_URI=mongodb+srv://<user>:<pass>@<cluster>/personal-task-tracker` in `.env`.
- **Docker:** `docker run -d -p 27017:27017 --name ptt-mongo mongo:7`
- **Local install:** MongoDB Community Server, which defaults to the `.env.example` URI.

The server refuses to start without a reachable database, by design — a failed
connection surfaces at boot rather than on the first request.

## Scripts

| Script                 | Description                                       |
| ---------------------- | ------------------------------------------------- |
| `npm run dev`          | Start with `tsx watch` (hot reload)               |
| `npm run build`        | Compile to `dist/` and rewrite `@/*` path aliases |
| `npm start`            | Run the compiled build                            |
| `npm run typecheck`    | `tsc --noEmit`                                    |
| `npm run lint`         | ESLint (type-aware rules)                         |
| `npm run lint:fix`     | ESLint with `--fix`                               |
| `npm run format`       | Prettier write                                    |
| `npm run format:check` | Prettier check                                    |

## Project structure

```
src/
├── app.ts                  Express app assembly (middleware + routes)
├── server.ts               Entry point: DB connect, listen, graceful shutdown
├── config/
│   ├── env.ts              Zod-validated environment variables
│   └── db.ts               Mongoose connection lifecycle
├── controllers/            Request handlers
├── models/                 Mongoose schemas and models
├── routes/
│   ├── index.ts            Mounts feature routers under /api/v1
│   └── health.routes.ts
├── middleware/
│   ├── error-handler.ts    Terminal error middleware
│   └── not-found.ts        404 catch-all
└── utils/
    ├── api-error.ts        ApiError with status-code factories
    └── logger.ts           Level-aware console logger
```

`@/*` is a path alias for `src/*`, resolved by `tsx` in development and rewritten
by `tsc-alias` at build time.

## Conventions

- **Errors:** throw `ApiError.badRequest(...)`, `ApiError.notFound(...)`, etc. Express 5
  forwards rejected promises from async handlers to the error middleware, so route
  handlers need no `try`/`catch` wrapper. Zod, Mongoose validation/cast, and duplicate-key
  errors are translated to the right status code automatically.
- **Config:** read values from `@/config/env`, never `process.env` directly — the schema
  is the single source of truth and fails fast on a bad value.
- **Adding a feature:** model in `models/`, handlers in `controllers/`, a router in
  `routes/<feature>.routes.ts`, then mount it in `routes/index.ts`.

## API

| Method | Endpoint          | Description                                  |
| ------ | ----------------- | -------------------------------------------- |
| GET    | `/api/v1/health`  | Liveness + database status (503 if degraded) |

Error responses share one shape:

```json
{ "status": "error", "message": "Route not found: GET /api/v1/nope" }
```

`details` is included for validation failures; `stack` is included outside production.
