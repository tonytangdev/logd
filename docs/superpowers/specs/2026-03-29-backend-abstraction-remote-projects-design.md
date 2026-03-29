# Phase 1: Backend Abstraction + Remote Project Support in CLI

> GitHub issue: #29

## Context

logd is local-first (SQLite + Ollama embeddings). This design adds optional remote server support so teams can share decisions. The project is the routing unit — each project is either local or linked to a remote server/team.

Two deployment scenarios:
- **Self-hosted**: team runs their own logd server
- **SaaS**: logd.dev hosts multiple teams on one instance

AI agents are unaffected — they use project names as today. Routing is transparent.

## Decisions Made

- **Project-level routing**: each project is independently local or remote (not a global mode switch)
- **Explicit server at creation**: `--server` and `--team` flags on `project create` (no ambient "active server" context)
- **API token auth**: `logd login <url> --token <token>`. No OAuth. Env var `LOGD_TOKEN` for CI/agents.
- **Server-side embeddings for remote projects**: CLI skips Ollama, sends raw text to server
- **Interface + Factory pattern**: `DecisionBackend` / `ProjectBackend` interfaces, `BackendFactory` resolves per project

## 1. Backend Interface

Defined in `src/core/types.ts`:

```typescript
interface DecisionBackend {
  create(decision: Decision, embedding?: number[]): Promise<void>
  findById(id: string): Promise<Decision | null>
  update(id: string, fields: Partial<Decision>): Promise<void>
  delete(id: string): Promise<void>
  list(project: string, filters?: ListFilters): Promise<Decision[]>
  search(project: string, embedding: number[], threshold: number, limit: number): Promise<SearchResult[]>
}

interface ProjectBackend {
  create(project: Project): Promise<void>
  findByName(name: string): Promise<Project | null>
  list(): Promise<Project[]>
}
```

- `LocalDecisionBackend` wraps existing `DecisionRepo` + sqlite-vec. No behavior change.
- `RemoteDecisionBackend` makes HTTP calls. For `search`, sends raw query text (server computes embeddings).
- `DecisionService` depends on `DecisionBackend` instead of concrete repo.

## 2. Project Configuration & Storage

Extend `Project` type with optional remote metadata:

```typescript
interface Project {
  id: string
  name: string
  description: string | null
  createdAt: string
  server: string | null    // e.g. "https://api.logd.dev"
  team: string | null      // e.g. "acme"
}
```

- `server === null` → local project (current behavior)
- `server` set → remote project, decisions route through `RemoteDecisionBackend`
- Project record always stored locally in SQLite (it's routing config, not synced data)

New DB columns: `server TEXT DEFAULT NULL`, `team TEXT DEFAULT NULL` via migration.

Creating a remote project:
```bash
logd project create acme-ecommerce --server https://api.logd.dev --team acme
```
1. Validates server reachable + token valid for that team
2. Creates project on remote server via API
3. Stores local project record with `server` and `team` set

## 3. Authentication & Credential Storage

**Login**:
```bash
logd login https://api.logd.dev --token my-api-token
```

**Storage** at `~/.logd/credentials.json`:
```json
{
  "servers": {
    "https://api.logd.dev": { "token": "my-api-token" },
    "https://logd.acme-internal.com": { "token": "other-token" }
  }
}
```

**Commands**:
- `logd logout <url>` — removes entry
- `logd server list` — shows authenticated servers

**Resolution**: `RemoteDecisionBackend` reads token for the project's `server` from credentials. Missing token → error with `logd login` hint.

**Env var**: `LOGD_TOKEN` overrides for CI/agent use.

## 4. RemoteClient

New `src/infra/remote.client.ts`:

```typescript
class RemoteClient {
  constructor(private baseUrl: string, private token: string, private team: string) {}

  createDecision(project: string, input: CreateDecisionInput): Promise<Decision>
  getDecision(id: string): Promise<Decision | null>
  updateDecision(id: string, fields: Partial<Decision>): Promise<void>
  deleteDecision(id: string): Promise<void>
  listDecisions(project: string, filters?: ListFilters): Promise<Decision[]>
  searchDecisions(project: string, query: string, threshold: number, limit: number): Promise<SearchResult[]>
  createProject(name: string, description?: string): Promise<void>
  validateToken(): Promise<boolean>
}
```

- All requests: `Authorization: Bearer <token>`, `X-Team: <team>` headers
- `searchDecisions` sends raw query string, no embedding
- HTTP errors mapped to user-friendly messages (401 → "token expired", 403 → "not a member of this team")

## 5. BackendFactory

New `src/core/backend.factory.ts`:

```typescript
class BackendFactory {
  constructor(
    private localDecisionRepo: DecisionRepo,
    private localProjectRepo: ProjectRepo,
    private credentialStore: CredentialStore,
    private embeddingService: EmbeddingService
  ) {}

  forProject(project: Project): {
    decisions: DecisionBackend
    embeddings: EmbeddingService | null  // null for remote
  }
}
```

- `project.server === null` → local backend + embedding service
- `project.server` set → reads token from `CredentialStore`, returns remote backend + null embeddings

**Service layer change**: `DecisionService` resolves project first (always local SQLite), then asks factory for backend. If embeddings non-null, compute locally. If null, skip — remote backend sends raw text.

CLI commands and MCP tools don't change — same service methods.

## 6. AI Agent Impact

None. Agents use project names via MCP tools as today. Routing is invisible.

Only new surface: `logd_create_project` gains optional `server` and `team` params. Agents won't typically use these — humans set up remote projects, agents just use them.

Missing/expired token → clear error message.

No new MCP tools needed.

## 7. File Changes

| Action | File | What |
|--------|------|------|
| Edit | `src/core/types.ts` | `server`/`team` on `Project`, `DecisionBackend`/`ProjectBackend` interfaces |
| Edit | `src/infra/db.ts` | Migration: `server`/`team` columns on `projects` |
| New | `src/infra/credentials.ts` | `CredentialStore` — read/write `~/.logd/credentials.json` |
| New | `src/infra/remote.client.ts` | `RemoteClient` — HTTP client for server API |
| New | `src/infra/remote.decision.repo.ts` | `RemoteDecisionBackend` via `RemoteClient` |
| New | `src/infra/remote.project.repo.ts` | `RemoteProjectBackend` via `RemoteClient` |
| Edit | `src/infra/decision.repo.ts` | Implement `DecisionBackend` interface |
| Edit | `src/infra/project.repo.ts` | Implement `ProjectBackend` interface |
| New | `src/core/backend.factory.ts` | `BackendFactory` — resolve backend per project |
| Edit | `src/core/decision.service.ts` | Use `BackendFactory` instead of concrete repos |
| Edit | `src/core/project.service.ts` | Accept `--server`/`--team`, validate server |
| New | `src/cli/commands/login.ts` | `logd login` / `logd logout` / `logd server list` |
| Edit | `src/cli/commands/project.ts` | `--server`/`--team` flags on `project create` |
| Edit | `src/cli/index.ts` | Register new commands |
| Edit | `src/mcp/server.ts` | Optional `server`/`team` on `logd_create_project` |

## Out of Scope

- Server implementation (Phase 2, #30)
- SaaS/billing (Phase 3, #31)
- Sync/conflict resolution (decisions live on one side only — local or remote)
- Migration of existing local projects to remote
