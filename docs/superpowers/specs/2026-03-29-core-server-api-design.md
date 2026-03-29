# Phase 2a: Core Server API

> GitHub issue: #34

## Context

logd CLI can route decisions to a remote server (Phase 1). The `RemoteClient` in the CLI defines the exact API contract. This spec builds the server that fulfills that contract.

Monorepo is set up (Phase 2c) — server lives at `packages/server/`.

## Decisions Made

- **Hono** — lightweight, TypeScript-native HTTP framework
- **SQLite** (better-sqlite3 + sqlite-vec) — same as CLI, simple for self-hosting. Postgres later.
- **Single token auth** — `LOGD_API_TOKEN` env var. One token, one implicit team. Phase 2b adds proper team management.
- **X-Team header ignored** — accepted but not used for scoping in Phase 2a
- **Ollama for embeddings** — same as CLI, configured via env vars
- **Hexagonal architecture** — domain/ports/application/adapters separation
- **Types from `@logd/shared`** — server uses `Decision`, `Project`, `SearchResult`, etc. from shared. Domain layer uses shared types directly (no re-definition) since both CLI and server must agree on the data contract.

## 1. API Endpoints

Exact match to `RemoteClient` contract:

| Method | Path | Body | Response | Notes |
|--------|------|------|----------|-------|
| `POST` | `/decisions` | `CreateDecisionInput` | `Decision` (201) | Server generates ID, timestamps, computes embedding |
| `GET` | `/decisions/:id` | — | `Decision` (200) or 404 | |
| `PATCH` | `/decisions/:id` | `UpdateDecisionInput` | 204 | Re-computes embedding |
| `DELETE` | `/decisions/:id` | — | 204 | Deletes from both `decisions` and `decisions_vec` |
| `GET` | `/decisions?project=&status=&limit=` | — | `Decision[]` (200) | |
| `POST` | `/decisions/search` | `{project, query, threshold, limit}` | `SearchResult[]` (200) | `project` is required. Server computes embedding. |
| `POST` | `/projects` | `{name, description?}` | 201 (empty body) | |
| `GET` | `/auth/validate` | — | 200 | Validates Bearer token |

All endpoints require `Authorization: Bearer <token>`. `X-Team` header accepted but ignored.

**Error responses:**
- 401: `"Authentication failed: token expired or invalid."` — missing/invalid token
- 404: `"Decision '<id>' not found"` — GET/PATCH/DELETE with unknown ID
- 400: `"<field> is required"` — missing required fields (title, project on create; query, project on search)
- 409: `"Project '<name>' already exists"` — duplicate project name

Note: `CreateDecisionInput` from `@logd/shared` already includes `project`. The RemoteClient sends `{ ...input, project }` which is just `CreateDecisionInput`.

## 2. Architecture (Hexagonal)

```
packages/server/src/
  index.ts              # entry point — starts server
  config.ts             # env var config

  domain/
    decision.ts         # Decision entity logic (build, validate)
    project.ts          # Project entity logic

  ports/
    decision.repository.ts   # interface: DecisionRepository
    project.repository.ts    # interface: ProjectRepository
    embedding.provider.ts    # interface: EmbeddingProvider

  application/
    decision.service.ts      # use cases: create, get, update, delete, list, search
    project.service.ts       # use cases: create project

  adapters/
    persistence/
      sqlite.decision.repo.ts   # implements DecisionRepository
      sqlite.project.repo.ts    # implements ProjectRepository
      database.ts               # SQLite setup
    embedding/
      ollama.provider.ts        # implements EmbeddingProvider
    http/
      app.ts                    # Hono app factory
      middleware/
        auth.ts                 # Bearer token validation
      routes/
        decisions.ts            # HTTP → service calls
        projects.ts
        auth.ts
```

- **Domain**: pure business logic, no dependencies. Uses types from `@logd/shared`.
- **Ports**: interfaces (repository, embedding provider)
- **Application**: use cases, depends only on ports
- **Adapters**: implementations (SQLite, Ollama, Hono HTTP)
- **Dependency injection** at startup in `index.ts`

**Persistence adapters** map between DB columns (snake_case: `created_at`, `updated_at`) and domain types (camelCase: `createdAt`, `updatedAt`). Arrays (alternatives, tags, links) stored as JSON strings, parsed on read.

## 3. Database Schema

Same tables as CLI (minus `server`/`team` on projects — that's CLI routing config):

```sql
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS decisions (
  id TEXT PRIMARY KEY,
  project TEXT NOT NULL REFERENCES projects(name),
  title TEXT NOT NULL,
  context TEXT,
  alternatives TEXT,
  tags TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  links TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE VIRTUAL TABLE IF NOT EXISTS decisions_vec USING vec0(
  id TEXT PRIMARY KEY,
  embedding float[1024] distance_metric=cosine
);
```

Note: embedding dimension (1024) is coupled to `qwen3-embedding:0.6b`. If the model changes, the vec table must be recreated. This is acceptable for Phase 2a.

## 4. Auth Middleware

Hono middleware applied to all routes:

- Extracts `Authorization: Bearer <token>` header
- Compares against `LOGD_API_TOKEN` env var
- No token or wrong token → 401 `"Authentication failed: token expired or invalid."`
- Valid token → next()
- `X-Team` header accepted but not used
- `/auth/validate` goes through the same middleware — passing = 200

## 5. Embedding & Search

**On create/update:**
1. `DecisionService` calls `EmbeddingProvider.embed(documentText)`
2. Document template: `Decision: {title}\nContext: {context}\nAlternatives: {alts}\nTags: {tags}\nStatus: {status}` (same as CLI)
3. `OllamaProvider` calls `{ollamaUrl}/api/embed`
4. Embedding stored in `decisions_vec`

**On delete:**
- Delete from both `decisions` and `decisions_vec` (prevents orphaned vectors in search)

**On search (`POST /decisions/search`):**
1. Receives `{project, query, threshold, limit}` — `project` is required (unlike CLI's `SearchInput` where it's optional)
2. Query template: `Instruct: Given a question about past decisions, retrieve relevant decision records\nQuery: {query}` (same as CLI)
3. `EmbeddingProvider.embed(queryText)` → vector
4. Cosine similarity search in `decisions_vec`, then join with `decisions` table to filter by project
5. Filter by threshold, return `SearchResult[]`

Note: `decisions_vec` has no `project` column. The repo must query vectors first, then look up the decision to check project membership (same approach as CLI's `DecisionRepo.searchByVector`).

Embedding templates duplicated from CLI (small, avoids coupling).

## 6. Config

All via env vars:

| Env var | Default | Required | Purpose |
|---------|---------|----------|---------|
| `LOGD_PORT` | `3000` | No | Server port |
| `LOGD_API_TOKEN` | — | **Yes** | Auth token |
| `LOGD_DB_PATH` | `./logd-server.db` | No | SQLite file path |
| `LOGD_OLLAMA_URL` | `http://localhost:11434` | No | Ollama endpoint |
| `LOGD_MODEL` | `qwen3-embedding:0.6b` | No | Embedding model |

Server fails to start if `LOGD_API_TOKEN` is not set.

## 7. Dependencies

```json
{
  "dependencies": {
    "@logd/shared": "*",
    "hono": "^4",
    "@hono/node-server": "^1",
    "better-sqlite3": "^12.8.0",
    "sqlite-vec": "^0.1.7",
    "uuid": "^13.0.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.13",
    "@types/node": "^25.5.0",
    "@types/uuid": "^10.0.0",
    "typescript": "^6.0.2",
    "vitest": "^4.1.2"
  }
}
```

## 8. Testing Strategy

- **Unit tests**: services with mocked ports
- **Integration tests**: routes via Hono's `app.request()` (no real HTTP server) with in-memory SQLite and mocked embedding provider
- **Test files** co-located with source:

```
application/decision.service.test.ts
application/project.service.test.ts
adapters/http/routes/decisions.test.ts
adapters/http/routes/projects.test.ts
adapters/http/routes/auth.test.ts
adapters/http/middleware/auth.test.ts
adapters/persistence/sqlite.decision.repo.test.ts
adapters/persistence/sqlite.project.repo.test.ts
```

## Out of Scope

- Multi-tenant team scoping (Phase 2b, #35)
- Token management API (Phase 2b)
- PostgreSQL support (future)
- Dockerfile / deployment (Phase 2d, #36)
- E2E tests against RemoteClient (future)
