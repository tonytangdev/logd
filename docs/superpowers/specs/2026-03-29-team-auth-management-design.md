# Phase 2b: Team & Auth Management

> GitHub issue: #35

## Context

Phase 2a built the core server API with single-token auth (`LOGD_API_TOKEN` env var). Phase 2b adds multi-tenant team support: real users, teams, DB-backed tokens, role-based access. The CLI already sends `X-Team` headers and stores per-server tokens — no CLI changes needed for basic functionality.

## Decisions Made

- **Full multi-tenant SaaS model** — real user entities, teams, membership, roles. CLI stays backend-agnostic (works with any server).
- **API keys only** — no OAuth/OIDC. Tokens generated server-side, CLI stores them via `logd login`.
- **Admin-only user creation** — admins create users via API, share tokens out-of-band. No self-registration.
- **Bootstrap via env var** — `LOGD_API_TOKEN` seeds the first admin user + default team on empty DB. After that, DB is authoritative.
- **Projects own the team boundary** — projects have `team_id`, decisions inherit team from their project. `X-Team` header determines scope.
- **Simple role split** — admins manage team/users/membership. Members have full CRUD on decisions/projects within team. Granular permissions deferred.
- **Monolithic phase** — all auth/team work in one spec. Hexagonal architecture makes it clean.

## 1. Data Model

### New Tables

```sql
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS team_members (
  user_id TEXT NOT NULL REFERENCES users(id),
  team_id TEXT NOT NULL REFERENCES teams(id),
  role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, team_id)
);

CREATE TABLE IF NOT EXISTS tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT
);
```

### Migration on Existing Tables

```sql
ALTER TABLE projects ADD COLUMN team_id TEXT REFERENCES teams(id);
```

Existing teamless projects are assigned to the bootstrap default team during seed. After migration, `team_id` is required for new projects (enforced at application layer, not DB constraint, to allow migration).

## 2. Bootstrap & Seed

On server startup:

1. Run migrations (create new tables, add `team_id` to projects)
2. If `users` table is empty AND `LOGD_API_TOKEN` is set:
   - Create admin user: `email: "admin@localhost"`, `name: "Admin"`
   - Create default team: `name: "default"`
   - Add admin as member with `role: "admin"`
   - Create token: hash of `LOGD_API_TOKEN`, `name: "bootstrap"`
   - Assign all existing teamless projects to default team
3. If `users` table is not empty → `LOGD_API_TOKEN` env var is ignored

This gives Phase 2a users a seamless upgrade: their existing token becomes the admin token of the default team.

## 3. Auth Flow

Auth middleware rewrite (replaces Phase 2a single-token check):

1. Extract `Bearer <token>` from `Authorization` header
2. Hash token with SHA-256
3. Look up `token_hash` in `tokens` table → get `user_id`
4. No match → 401 `"Authentication failed: token expired or invalid."`
5. Read `X-Team` header
6. No X-Team → 401 `"X-Team header is required"`
7. Look up `(user_id, team_id)` in `team_members` where team name matches X-Team
8. No membership → 403 `"Access denied: not a member of this team."`
9. Set request context: `{ userId, teamId, role }`
10. Update `last_used_at` on token (fire-and-forget)

## 4. API Endpoints

### Team Management (admin only)

| Method | Path | Body | Response | Notes |
|--------|------|------|----------|-------|
| `POST` | `/teams` | `{name}` | `Team` (201) | Admin of any team can create new teams |
| `GET` | `/teams` | — | `Team[]` (200) | Lists teams the current user belongs to |
| `DELETE` | `/teams/:id` | — | 204 | Admin only. Fails if team has projects. |

### User Management (admin only)

| Method | Path | Body | Response | Notes |
|--------|------|------|----------|-------|
| `POST` | `/users` | `{email, name}` | `{user: User, token: string}` (201) | Creates user + initial token. Raw token returned once. |
| `GET` | `/users` | — | `User[]` (200) | Lists users in the current team |

### Team Membership (admin only)

| Method | Path | Body | Response | Notes |
|--------|------|------|----------|-------|
| `POST` | `/teams/:id/members` | `{userId, role}` | 201 | Add user to team |
| `DELETE` | `/teams/:id/members/:userId` | — | 204 | Remove user from team |
| `PATCH` | `/teams/:id/members/:userId` | `{role}` | 204 | Change role |

### Token Management (self-service)

| Method | Path | Body | Response | Notes |
|--------|------|------|----------|-------|
| `POST` | `/tokens` | `{name}` | `{token: string}` (201) | Creates token for current user. Raw token returned once. |
| `GET` | `/tokens` | — | `Token[]` (200) | Lists current user's tokens (no raw values) |
| `DELETE` | `/tokens/:id` | — | 204 | Revoke own token |

### Changes to Existing Endpoints

All decision/project endpoints now filter by `teamId` from request context:

- `POST /projects` — auto-assigns `team_id` from context
- `GET /decisions`, `POST /decisions/search`, etc. — scoped to current team's projects
- `GET /auth/validate` — now validates token + team membership (returns 403 if not in team)

### Error Responses (new)

- 401: `"X-Team header is required"` — missing X-Team header
- 403: `"Access denied: not a member of this team."` — valid token, not in team
- 403: `"Admin access required"` — non-admin hitting admin endpoints
- 409: `"User with email '<email>' already exists"` — duplicate user
- 409: `"Team '<name>' already exists"` — duplicate team
- 400: `"Cannot delete team with existing projects"` — delete team guard

### Role Enforcement

- Team/user/membership endpoints → require `role === "admin"` in the current team
- Token endpoints → any authenticated user (self-service)
- Decision/project endpoints → any team member (admin or member)

## 5. Token Design

- Raw tokens: `crypto.randomBytes(32).toString("hex")` — 64-char hex strings
- Storage: SHA-256 hash of raw token (`crypto.createHash("sha256")`)
- Raw token returned once on creation, never stored or retrievable
- Token lookup on auth: hash incoming token, query by `token_hash`

## 6. Architecture

### New Files

```
packages/server/src/
  domain/
    user.ts                          # build User
    team.ts                          # build Team
    token.ts                         # token generation, hashing

  ports/
    user.repository.ts               # UserRepository interface
    team.repository.ts               # TeamRepository interface
    token.repository.ts              # TokenRepository interface

  application/
    user.service.ts                  # create user, list by team
    team.service.ts                  # create/delete team, manage members
    token.service.ts                 # create/revoke/list, authenticate

  adapters/
    persistence/
      sqlite.user.repo.ts
      sqlite.team.repo.ts
      sqlite.token.repo.ts
    http/
      middleware/
        auth.ts                      # rewritten — DB-backed token + team
        role.ts                      # admin role guard
      routes/
        teams.ts
        users.ts
        tokens.ts
```

### Modified Files

- `database.ts` — new tables, `team_id` migration
- `index.ts` — bootstrap seed logic, wire new services/repos
- `app.ts` — mount new routes
- `sqlite.project.repo.ts` — filter by `team_id`
- `sqlite.decision.repo.ts` — join through projects for team filtering
- `routes/decisions.ts` — pass `teamId` from context
- `routes/projects.ts` — pass `teamId`, auto-assign on create

### Request Context

Auth middleware attaches context via Hono's `c.set()` / `c.get()`:

```typescript
// middleware sets
c.set("userId", userId);
c.set("teamId", teamId);
c.set("role", role);

// handlers read
const teamId = c.get("teamId");
```

### Persistence Adapters

Map between DB columns (snake_case) and domain types (camelCase), same pattern as Phase 2a. Token hash stored as hex string. Arrays/JSON follow existing convention.

## 7. Shared Types

New types to add to `@logd/shared`:

```typescript
export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

export interface Team {
  id: string;
  name: string;
  createdAt: string;
}

export type TeamRole = "admin" | "member";

export interface TeamMember {
  userId: string;
  teamId: string;
  role: TeamRole;
  createdAt: string;
}

export interface Token {
  id: string;
  userId: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
}
```

## 8. Testing Strategy

### Unit Tests (mocked ports)

- `user.service.test.ts` — create user, duplicate email error
- `team.service.test.ts` — create/delete team, add/remove members, role checks, delete guard
- `token.service.test.ts` — create (returns raw once), authenticate by hash, revoke

### Integration Tests (in-memory SQLite + `app.request()`)

- `sqlite.user.repo.test.ts` — CRUD, unique email constraint
- `sqlite.team.repo.test.ts` — CRUD, membership queries
- `sqlite.token.repo.test.ts` — store hash, lookup by hash, last_used_at
- `routes/teams.test.ts` — team CRUD, admin-only enforcement
- `routes/users.test.ts` — user creation returns token, list by team
- `routes/tokens.test.ts` — self-service token management
- `middleware/auth.test.ts` — rewritten: DB-backed auth + team scoping
- `middleware/role.test.ts` — admin guard middleware

### Modified Endpoint Tests

- `routes/decisions.test.ts` — team scoping (can't see other team's decisions)
- `routes/projects.test.ts` — team scoping, auto-assign team_id

### Bootstrap Tests

- Seed creates admin user + default team on empty DB
- Seed skipped when users table not empty
- Existing projects assigned to default team

## 9. Config Changes

| Env var | Change |
|---------|--------|
| `LOGD_API_TOKEN` | Now seeds bootstrap admin on empty DB. Ignored after first seed. |

No new env vars required.

## Out of Scope

- OAuth/OIDC, SSO (future)
- Self-registration (future)
- Granular permissions — edit/delete own decisions only (future)
- CLI admin commands — `logd team create`, `logd user create` (Phase 2b follow-up or separate issue)
- Email notifications/invites (future)
- Token expiration/rotation (future)
- PostgreSQL support (future)
