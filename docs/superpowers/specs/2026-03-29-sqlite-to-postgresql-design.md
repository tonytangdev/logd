# SQLite to PostgreSQL Migration Design

**Issue:** #37
**Date:** 2026-03-29

## Goal

Replace SQLite with PostgreSQL as the database backend for the server package. Replace vec0 with pgvector for embedding search.

## Decisions

- **Full replacement** — no dual SQLite/Postgres support
- **Drizzle ORM** — type-safe schema + query builder on top of `postgres` driver
- **Drizzle Kit** — migration generation and execution
- **DATABASE_URL env var** — Docker Compose for local dev, any Postgres for production
- **PGlite for tests** — in-process Postgres, no Docker needed in CI

## Dependencies

### Add

- `drizzle-orm` — schema definition, query builder, migration runner
- `postgres` — underlying PostgreSQL driver (postgres.js)
- `@electric-sql/pglite` (dev) — in-process Postgres for tests
- `drizzle-kit` (dev) — migration CLI

### Remove

- `better-sqlite3`, `@types/better-sqlite3`, `sqlite-vec`

## Schema

New file: `src/adapters/persistence/schema.ts`

Define all tables via Drizzle's `pgTable`:

```
users         — id (PK), email (unique), name, created_at
teams         — id (PK), name (unique), created_at
team_members  — user_id (FK→users), team_id (FK→teams), role (enum), created_at, PK(user_id, team_id)
tokens        — id (PK), user_id (FK→users), token_hash (unique), name, created_at, last_used_at
projects      — id (PK), name (unique), description, team_id (FK→teams), created_at, unique(name, team_id)
decisions     — id (PK), project (FK→projects.name), title, context, alternatives, tags, status (enum), links, created_at, updated_at
decisions_vec — id (PK, FK→decisions), embedding vector(1024)
```

**Note:** `projects.name` retains its global uniqueness constraint (matching current SQLite behavior). The `unique(name, team_id)` index is an additional constraint.

**Note:** `decisions.project` FK references `projects.name` (not `projects.id`). This matches current behavior. Changing to FK on `id` is out of scope for this migration.

pgvector extension enabled at startup: `CREATE EXTENSION IF NOT EXISTS vector`.

## Database Connection

Replace `createDatabase(dbPath)` in `database.ts`:

- Accept `DATABASE_URL` string
- Create `postgres(url)` client
- Wrap in `drizzle(client, { schema })`
- Run migrations via `migrate()` from `drizzle-orm/postgres-js/migrator`
- Export Drizzle instance

**Test setup:** Use `drizzle-orm/pglite` adapter (different constructor than production `drizzle-orm/postgres-js`).

## Config Changes

In `config.ts`:

- Remove `LOGD_DB_PATH` / `dbPath`
- Add `DATABASE_URL` / `databaseUrl` (default: `postgresql://logd:logd@localhost:5432/logd`)

## Repository Rewrites

Each `sqlite.*.repo.ts` replaced by `pg.*.repo.ts`:

- Drizzle queries replace raw SQL prepared statements
- `searchByVector` uses pgvector's `<=>` cosine distance operator via Drizzle's `sql` tagged template

### Async Ripple

`better-sqlite3` was synchronous; `postgres`/Drizzle is async. This is a significant change:

1. **Port interfaces** (`src/ports/*.repository.ts`) — all method signatures change from `(): T` to `(): Promise<T>`
2. **Services** (`src/application/*.service.ts`) — many services have synchronous methods that call sync repos. These methods must become `async` and `await` repo calls.
3. **HTTP route handlers** (`src/adapters/http/routes/*.ts`) — handlers that call service methods need to `await` newly-async service calls.
4. **Bootstrap** (`src/application/bootstrap.ts`) — must become async and use port interfaces instead of concrete `Sqlite*Repo` types.

## Migrations

- `drizzle.config.ts` at `packages/server/` root
- Points to schema file, outputs to `drizzle/` directory
- `drizzle-kit generate` produces versioned SQL migration files
- Migrations run at server startup via Drizzle's `migrate()` function

## Docker Compose

Update `docker-compose.yml`:

- Add `postgres` service using `pgvector/pgvector:pg17` image
- Environment: `POSTGRES_USER=logd`, `POSTGRES_PASSWORD=logd`, `POSTGRES_DB=logd`
- Health check: `pg_isready` — server uses `depends_on: postgres: condition: service_healthy`
- Volume for data persistence
- Pass `DATABASE_URL` to server service
- Remove any SQLite volume mount

## Tests

- Replace `createInMemoryDatabase()` with PGlite-based helper
- PGlite supports pgvector: `await db.exec('CREATE EXTENSION vector')`
- Wrap PGlite instance in Drizzle via PGlite adapter (`drizzle-orm/pglite`)
- Same test structure, all repo calls now awaited
- No Docker required for CI

## Files Changed

### New
- `src/adapters/persistence/schema.ts` — Drizzle schema
- `src/adapters/persistence/pg.user.repo.ts`
- `src/adapters/persistence/pg.team.repo.ts`
- `src/adapters/persistence/pg.token.repo.ts`
- `src/adapters/persistence/pg.project.repo.ts`
- `src/adapters/persistence/pg.decision.repo.ts`
- `packages/server/drizzle.config.ts`
- `drizzle/` — generated migration files

### Modified
- `src/adapters/persistence/database.ts` — Postgres connection + PGlite test helper
- `src/config.ts` — replace dbPath with databaseUrl
- `src/index.ts` — async db init, new repo constructors
- `src/ports/*.repository.ts` — async signatures
- `src/application/*.service.ts` — async methods, await repo calls
- `src/application/bootstrap.ts` — async, use port interfaces instead of concrete SQLite types
- `src/adapters/http/routes/*.ts` — await newly-async service calls
- `packages/server/package.json` — deps
- `docker-compose.yml` — postgres service with health check
- `.env.example` — replace LOGD_DB_PATH with DATABASE_URL
- All test files — async repos, PGlite helper

### Deleted
- `src/adapters/persistence/sqlite.*.repo.ts` (5 files)
