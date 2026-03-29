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
- `postgres` — underlying PostgreSQL driver
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
projects      — id (PK), name, description, team_id (FK→teams), created_at, unique(name, team_id)
decisions     — id (PK), project (FK→projects.name), title, context, alternatives, tags, status (enum), links, created_at, updated_at
decisions_vec — id (PK, FK→decisions), embedding vector(1024)
```

pgvector extension enabled at startup: `CREATE EXTENSION IF NOT EXISTS vector`.

## Database Connection

Replace `createDatabase(dbPath)` in `database.ts`:

- Accept `DATABASE_URL` string
- Create `postgres(url)` client
- Wrap in `drizzle(client, { schema })`
- Run migrations via `migrate()` from `drizzle-orm/node-postgres/migrator` (or equivalent for `postgres` driver)
- Export Drizzle instance

## Config Changes

In `config.ts`:

- Remove `LOGD_DB_PATH`
- Add `DATABASE_URL` (default: `postgresql://logd:logd@localhost:5432/logd`)

## Repository Rewrites

Each `sqlite.*.repo.ts` replaced by `pg.*.repo.ts`:

- Same port interfaces in `src/ports/` — no interface changes except **sync → async** method signatures
- Drizzle queries replace raw SQL prepared statements
- `searchByVector` uses pgvector's `<=>` cosine distance operator via Drizzle's `sql` tagged template

### Async Ripple

`better-sqlite3` was synchronous; `postgres`/Drizzle is async. All repo port interfaces become async (return `Promise<T>`). Services already use `async/await` but some call repo methods without `await` — these need updating.

## Migrations

- `drizzle.config.ts` at `packages/server/` root
- Points to schema file, outputs to `drizzle/` directory
- `drizzle-kit generate` produces versioned SQL migration files
- Migrations run at server startup via Drizzle's `migrate()` function

## Docker Compose

Update `docker-compose.yml`:

- Add `postgres` service using `pgvector/pgvector:pg17` image
- Environment: `POSTGRES_USER=logd`, `POSTGRES_PASSWORD=logd`, `POSTGRES_DB=logd`
- Volume for data persistence
- Pass `DATABASE_URL` to server service
- Remove any SQLite volume mount

## Tests

- Replace `createInMemoryDatabase()` with PGlite-based helper
- PGlite supports pgvector: `await db.exec('CREATE EXTENSION vector')`
- Wrap PGlite instance in Drizzle via `drizzle(pglite, { schema })`
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
- `src/adapters/persistence/database.ts` — Postgres connection
- `src/config.ts` — DATABASE_URL
- `src/index.ts` — async db init, new repo constructors
- `src/ports/*.repository.ts` — async signatures
- `src/application/*.service.ts` — await sync repo calls
- `packages/server/package.json` — deps
- `docker-compose.yml` — postgres service
- `.env.example` — DATABASE_URL
- All test files — async repos, PGlite helper

### Deleted
- `src/adapters/persistence/sqlite.*.repo.ts` (5 files)
