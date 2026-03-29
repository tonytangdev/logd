# Phase 1: Backend Abstraction + Remote Project Support in CLI

> GitHub issue: #29

## Context

logd is local-first (SQLite + Ollama embeddings). This design adds optional remote server support so teams can share decisions. The project is the routing unit — each project is either local or linked to a remote server/team.

Every logd server is multi-tenant (supports multiple teams). Deployment scenarios differ only in who operates it:
- **Self-hosted**: a company runs their own logd server for their teams
- **SaaS**: log-decisions.com hosts teams as a managed service

Technically identical — the CLI doesn't distinguish between them. A user can be logged into both simultaneously, with different projects pointing to different servers.

AI agents are unaffected — they use project names as today. Routing is transparent.

## Decisions Made

- **Project-level routing**: each project is independently local or remote (not a global mode switch)
- **Explicit server at creation**: `--server` and `--team` flags on `project create` (no ambient "active server" context)
- **API token auth**: `logd login <url> --token <token>`. No OAuth. Env var `LOGD_TOKEN` for CI/agents.
- **Server-side embeddings for remote projects**: CLI skips Ollama, sends raw text to server
- **Interface + Factory pattern**: `DecisionBackend` interface, `BackendFactory` resolves per project

## 1. Backend Interface

Defined in `src/core/types.ts`. Two separate interfaces for the two search strategies:

```typescript
interface DecisionBackend {
  create(decision: Decision, embedding: number[]): Promise<void>
  findById(id: string): Promise<Decision | null>
  update(id: string, input: UpdateDecisionInput, embedding?: number[]): Promise<void>
  delete(id: string): Promise<void>
  list(options?: { project?: string; status?: DecisionStatus; limit?: number }): Promise<Decision[]>
}

interface LocalDecisionSearch {
  searchByVector(embedding: number[], limit: number, project?: string): Promise<SearchResult[]>
}

interface RemoteDecisionSearch {
  searchByQuery(project: string, query: string, threshold: number, limit: number): Promise<SearchResult[]>
}
```

**Key design choices**:
- `create` takes a fully-constructed `Decision` object (service builds it with ID, timestamps, defaults) + required `embedding`. Same as current `IDecisionRepo.create`. `RemoteDecisionBackend` ignores the embedding (server computes its own).
- `update` keeps the existing `UpdateDecisionInput` type + optional embedding (same as current `IDecisionRepo.update`).
- `list` keeps the existing options shape (`{project?, status?, limit?}`) — no signature change.
- Search is split into two interfaces because local and remote have fundamentally different inputs (embedding vector vs query string). The service layer handles this split (see Section 5).

**Sync→Async migration**: Current `IDecisionRepo` methods are synchronous. `LocalDecisionBackend` wraps them in `Promise.resolve()`. All `DecisionService` callers must be updated to `await`. This is the largest mechanical change in Phase 1.

**`ProjectBackend` is not needed**: Project records are always stored locally (routing config). Only the `RemoteClient` needs a `createProject` call to register the project on the server at creation time. No interface abstraction required.

## 2. Project Configuration & Storage

Extend `Project` type with optional remote metadata:

```typescript
interface Project {
  id: string
  name: string
  description: string | null
  createdAt: string
  server: string | null    // e.g. "https://api.log-decisions.com"
  team: string | null      // e.g. "acme"
}
```

- `server === null` → local project (current behavior)
- `server` set → remote project, decisions route through `RemoteDecisionBackend`
- Project record always stored locally in SQLite (it's routing config, not synced data)
- Delete/rename of remote projects: out of scope for Phase 1. Only create + read/list.

New DB columns: `server TEXT DEFAULT NULL`, `team TEXT DEFAULT NULL` via migration.

Creating a remote project:
```bash
logd project create acme-ecommerce --server https://api.log-decisions.com --team acme
```
1. Validates server reachable + token valid for that team
2. Creates project on remote server via API
3. Stores local project record with `server` and `team` set

## 3. Authentication & Credential Storage

**Login**:
```bash
logd login https://api.log-decisions.com --token my-api-token
```

**Storage** at `~/.logd/credentials.json` (created with `0600` permissions):
```json
{
  "servers": {
    "https://api.log-decisions.com": { "token": "my-api-token" },
    "https://logd.acme-internal.com": { "token": "other-token" }
  }
}
```

**Commands**:
- `logd logout <url>` — removes entry
- `logd server list` — shows authenticated servers

**Resolution**: `RemoteDecisionBackend` reads token for the project's `server` from credentials. Missing token → error with `logd login` hint.

**Env var**: `LOGD_TOKEN` applies when there is exactly one server configured or as a fallback for any server without a stored token. If the user has multiple servers with different tokens, they must use `logd login` for each. CI environments typically target one server, so this is sufficient.

## 4. RemoteClient

New `src/infra/remote.client.ts`:

```typescript
class RemoteClient {
  constructor(private baseUrl: string, private token: string, private team: string) {}

  createDecision(project: string, input: CreateDecisionInput): Promise<Decision>
  getDecision(id: string): Promise<Decision | null>
  updateDecision(id: string, input: UpdateDecisionInput): Promise<void>
  deleteDecision(id: string): Promise<void>
  listDecisions(options?: { project?: string; status?: DecisionStatus; limit?: number }): Promise<Decision[]>
  searchDecisions(project: string, query: string, threshold: number, limit: number): Promise<SearchResult[]>
  createProject(name: string, description?: string): Promise<void>
  validateToken(): Promise<boolean>
}
```

- All requests: `Authorization: Bearer <token>`, `X-Team: <team>` headers
- `searchDecisions` sends raw query string, no embedding
- HTTP errors mapped to user-friendly messages (401 → "token expired, run logd login", 403 → "not a member of this team")
- **Server unreachable at runtime**: operations fail with a clear error ("cannot reach server at <url>, check connection"). No retry or offline fallback — remote projects require connectivity.

## 5. BackendFactory

New `src/core/backend.factory.ts`:

```typescript
class BackendFactory {
  constructor(
    private localDecisionRepo: DecisionRepo,
    private credentialStore: CredentialStore,
    private embeddingService: EmbeddingService
  ) {}

  forProject(project: Project): {
    decisions: DecisionBackend
    search: LocalDecisionSearch | RemoteDecisionSearch
    embeddings: EmbeddingService | null  // null for remote
  }
}
```

- `project.server === null` → local backend + `LocalDecisionSearch` + embedding service
- `project.server` set → reads token from `CredentialStore`, returns remote backend + `RemoteDecisionSearch` + null embeddings

**Service layer change**: `DecisionService` resolves project first (always local SQLite — project repo unchanged), then asks factory for backend.

For search:
- If `embeddings` non-null → compute embedding locally, call `LocalDecisionSearch.searchByVector`, apply threshold filter in service (current behavior)
- If `embeddings` null → call `RemoteDecisionSearch.searchByQuery` with raw text, server handles everything

All other operations (`create`, `update`, `delete`, `list`, `findById`) go through `DecisionBackend` uniformly.

CLI commands and MCP tools don't change — same service methods.

## 6. AI Agent Impact

None. Agents use project names via MCP tools as today. Routing is invisible.

Only new surface: `logd_create_project` gains optional `server` and `team` params. Agents won't typically use these — humans set up remote projects, agents just use them.

Missing/expired token → clear error message.

No new MCP tools needed.

## 7. File Changes

| Action | File | What |
|--------|------|------|
| Edit | `src/core/types.ts` | `server`/`team` on `Project`, `DecisionBackend`/`LocalDecisionSearch`/`RemoteDecisionSearch` interfaces |
| Edit | `src/infra/db.ts` | Migration: `server`/`team` columns on `projects` |
| New | `src/infra/credentials.ts` | `CredentialStore` — read/write `~/.logd/credentials.json` (0600 perms) |
| New | `src/infra/remote.client.ts` | `RemoteClient` — HTTP client for server API |
| New | `src/infra/remote.decision.repo.ts` | `RemoteDecisionBackend` + `RemoteDecisionSearch` via `RemoteClient` |
| Edit | `src/infra/decision.repo.ts` | Implement `DecisionBackend` + `LocalDecisionSearch`, wrap sync→async |
| Edit | `src/infra/project.repo.ts` | Add `server`/`team` columns to queries |
| New | `src/core/backend.factory.ts` | `BackendFactory` — resolve backend per project |
| Edit | `src/core/decision.service.ts` | Use `BackendFactory`, await all repo calls, split search logic |
| Edit | `src/core/project.service.ts` | Accept `--server`/`--team`, validate server via `RemoteClient` |
| New | `src/cli/commands/login.ts` | `logd login` / `logd logout` / `logd server list` |
| Edit | `src/cli/commands/project.ts` | `--server`/`--team` flags on `project create` |
| Edit | `src/cli/index.ts` | Register new commands |
| Edit | `src/mcp/server.ts` | Optional `server`/`team` on `logd_create_project` |

## Out of Scope

- Server implementation (Phase 2, #30)
- SaaS/billing (Phase 3, #31)
- Sync/conflict resolution (decisions live on one side only — local or remote)
- Migration of existing local projects to remote
- Delete/rename of remote projects
- Offline fallback for remote projects
