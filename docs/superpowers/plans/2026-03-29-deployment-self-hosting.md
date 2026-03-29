# Deployment & Self-Hosting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Containerize the logd server with Docker, add health check endpoints, and write self-hosting documentation.

**Architecture:** Multi-stage Dockerfile (node:22-slim) building the monorepo, docker-compose with optional Ollama sidecar via profiles, health endpoints registered before auth middleware.

**Tech Stack:** Docker, docker-compose, Hono.js, better-sqlite3, sqlite-vec, Ollama

**Spec:** `docs/superpowers/specs/2026-03-29-deployment-self-hosting-design.md`

---

## File Map

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `packages/server/src/adapters/http/routes/health.ts` | Health route handlers |
| Create | `packages/server/src/adapters/http/routes/health.test.ts` | Health route tests |
| Modify | `packages/server/src/adapters/http/app.ts` | Register health routes before auth |
| Modify | `packages/server/src/index.ts` | Add startup warning for missing API token |
| Create | `Dockerfile` | Multi-stage server build |
| Create | `.dockerignore` | Exclude node_modules, .git, dist, *.db, .env |
| Create | `docker-compose.yml` | Server + optional Ollama sidecar |
| Create | `.env.example` | Documented env vars with defaults |
| Create | `packages/server/README.md` | Quick start guide |
| Create | `docs/self-hosting.md` | Detailed self-hosting guide |
| Modify | `README.md` | Add local-first positioning + server links |

---

### Task 1: Health Route — Liveness Endpoint

**Files:**
- Create: `packages/server/src/adapters/http/routes/health.ts`
- Create: `packages/server/src/adapters/http/routes/health.test.ts`

- [ ] **Step 1: Write failing test for GET /health**

```typescript
// packages/server/src/adapters/http/routes/health.test.ts
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { healthRoutes } from "./health.js";

describe("health routes", () => {
  describe("GET /health", () => {
    it("returns 200 with status ok", async () => {
      const app = new Hono();
      app.route("/", healthRoutes({ db: null as any, ollamaUrl: "" }));

      const res = await app.request("/health");
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: "ok" });
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w packages/server -- --run health`
Expected: FAIL — module not found

- [ ] **Step 3: Implement liveness endpoint**

```typescript
// packages/server/src/adapters/http/routes/health.ts
import type Database from "better-sqlite3";
import { Hono } from "hono";

export interface HealthDeps {
  db: Database.Database;
  ollamaUrl: string;
}

export function healthRoutes(deps: HealthDeps): Hono {
  const app = new Hono();

  app.get("/health", (c) => {
    return c.json({ status: "ok" });
  });

  return app;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w packages/server -- --run health`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/adapters/http/routes/health.ts packages/server/src/adapters/http/routes/health.test.ts
git commit -m "feat(server): add /health liveness endpoint"
```

---

### Task 2: Health Route — Readiness Endpoint

**Files:**
- Modify: `packages/server/src/adapters/http/routes/health.ts`
- Modify: `packages/server/src/adapters/http/routes/health.test.ts`

- [ ] **Step 1: Write failing tests for GET /health/ready**

Add to `health.test.ts`:

```typescript
import { afterEach, describe, expect, it, vi } from "vitest";
import type Database from "better-sqlite3";

// ...existing imports...

describe("GET /health/ready", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 200 when db and ollama are healthy", async () => {
    const mockDb = { prepare: vi.fn(() => ({ get: vi.fn(() => ({ 1: 1 })) })) } as unknown as Database.Database;
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));

    const app = new Hono();
    app.route("/", healthRoutes({ db: mockDb, ollamaUrl: "http://localhost:11434" }));

    const res = await app.request("/health/ready");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "ready", db: "ok", ollama: "ok" });
  });

  it("returns 503 when db fails", async () => {
    const mockDb = { prepare: vi.fn(() => { throw new Error("db down"); }) } as unknown as Database.Database;
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));

    const app = new Hono();
    app.route("/", healthRoutes({ db: mockDb, ollamaUrl: "http://localhost:11434" }));

    const res = await app.request("/health/ready");
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe("not_ready");
    expect(body.db).toBe("error");
    expect(body.ollama).toBe("ok");
  });

  it("returns 503 when ollama fails", async () => {
    const mockDb = { prepare: vi.fn(() => ({ get: vi.fn(() => ({ 1: 1 })) })) } as unknown as Database.Database;
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("connection refused"); }));

    const app = new Hono();
    app.route("/", healthRoutes({ db: mockDb, ollamaUrl: "http://localhost:11434" }));

    const res = await app.request("/health/ready");
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe("not_ready");
    expect(body.db).toBe("ok");
    expect(body.ollama).toBe("error");
  });
});
```

- [ ] **Step 2: Run test to verify they fail**

Run: `npm test -w packages/server -- --run health`
Expected: FAIL — /health/ready returns 404

- [ ] **Step 3: Implement readiness endpoint**

Add to `healthRoutes` in `health.ts`:

```typescript
app.get("/health/ready", async (c) => {
  let dbStatus = "ok";
  let ollamaStatus = "ok";

  try {
    deps.db.prepare("SELECT 1").get();
  } catch {
    dbStatus = "error";
  }

  try {
    const res = await fetch(`${deps.ollamaUrl}/api/tags`);
    if (!res.ok) ollamaStatus = "error";
  } catch {
    ollamaStatus = "error";
  }

  const ready = dbStatus === "ok" && ollamaStatus === "ok";
  return c.json(
    { status: ready ? "ready" : "not_ready", db: dbStatus, ollama: ollamaStatus },
    ready ? 200 : 503,
  );
});
```

- [ ] **Step 4: Run test to verify they pass**

Run: `npm test -w packages/server -- --run health`
Expected: PASS (all 4 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/adapters/http/routes/health.ts packages/server/src/adapters/http/routes/health.test.ts
git commit -m "feat(server): add /health/ready readiness endpoint"
```

---

### Task 3: Wire Health Routes Into App

**Files:**
- Modify: `packages/server/src/adapters/http/app.ts`
- Modify: `packages/server/src/index.ts`

- [ ] **Step 1: Update `createApp` to accept health deps and register health routes before auth**

In `packages/server/src/adapters/http/app.ts`:

```typescript
import { healthRoutes, type HealthDeps } from "./routes/health.js";

export interface AppDeps {
  tokenService: TokenService;
  teamService: TeamService;
  userService: UserService;
  decisionService: DecisionService;
  projectService: ProjectService;
  health: HealthDeps;
}

export function createApp(deps: AppDeps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  // Health routes — registered BEFORE auth middleware
  app.route("/", healthRoutes(deps.health));

  app.use("*", createAuthMiddleware(deps.tokenService));
  app.use("*", teamMiddleware(deps.teamService));
  // ...existing routes...
}
```

- [ ] **Step 2: Update `index.ts` to pass health deps**

In `packages/server/src/index.ts`, add to the `createApp` call:

```typescript
const app = createApp({
  tokenService,
  teamService,
  userService,
  decisionService,
  projectService,
  health: { db, ollamaUrl: config.ollamaUrl },
});
```

- [ ] **Step 3: Run all server tests**

Run: `npm test -w packages/server`
Expected: all tests PASS (existing route tests construct their own Hono apps with auth, so they're unaffected)

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/adapters/http/app.ts packages/server/src/index.ts
git commit -m "feat(server): wire health routes before auth middleware"
```

---

### Task 4: Startup Warning for Missing API Token

**Files:**
- Modify: `packages/server/src/index.ts`

- [ ] **Step 1: Add warning after config load**

In `packages/server/src/index.ts`, after `const config = loadConfig();`:

```typescript
if (!config.apiToken) {
  console.warn("LOGD_API_TOKEN not set — bootstrap will skip admin creation");
}
```

- [ ] **Step 2: Run server tests to verify no regressions**

Run: `npm test -w packages/server`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/index.ts
git commit -m "feat(server): warn when LOGD_API_TOKEN missing"
```

---

### Task 5: .dockerignore

**Files:**
- Create: `.dockerignore`

- [ ] **Step 1: Create .dockerignore**

```
node_modules
.git
dist
*.db
.env
.env.*
!.env.example
docs
**/*.test.ts
```

- [ ] **Step 2: Commit**

```bash
git add .dockerignore
git commit -m "chore: add .dockerignore"
```

---

### Task 6: Dockerfile

**Files:**
- Create: `Dockerfile`

- [ ] **Step 1: Write the Dockerfile**

```dockerfile
# Stage 1: Build
FROM node:22-slim AS build
RUN apt-get update && apt-get install -y build-essential python3 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
RUN npm ci

COPY packages/shared/ packages/shared/
COPY packages/server/ packages/server/
COPY tsconfig.base.json ./
RUN npm run build -w packages/shared && npm run build -w packages/server
RUN npm prune --omit=dev

# Stage 2: Production
FROM node:22-slim
WORKDIR /app

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/packages/shared/package.json packages/shared/
COPY --from=build /app/packages/shared/dist/ packages/shared/dist/
COPY --from=build /app/packages/server/package.json packages/server/
COPY --from=build /app/packages/server/dist/ packages/server/dist/
COPY --from=build /app/node_modules/ node_modules/
COPY --from=build /app/packages/shared/node_modules/ packages/shared/node_modules/
COPY --from=build /app/packages/server/node_modules/ packages/server/node_modules/

EXPOSE 3000
CMD ["node", "packages/server/dist/index.js"]
```

- [ ] **Step 2: Verify the build**

Run: `docker build -t logd-server .`
Expected: Builds successfully

- [ ] **Step 3: Commit**

```bash
git add Dockerfile
git commit -m "feat: multi-stage Dockerfile for server"
```

---

### Task 7: .env.example and docker-compose.yml

**Files:**
- Create: `.env.example`
- Create: `docker-compose.yml`

- [ ] **Step 1: Create .env.example**

```bash
# logd server configuration
LOGD_PORT=3000
LOGD_API_TOKEN=changeme
LOGD_DB_PATH=/data/logd-server.db
# LOGD_OLLAMA_URL=http://localhost:11434  # Leave commented to use Ollama sidecar (--profile full). Set to your Ollama URL if running your own.
LOGD_MODEL=qwen3-embedding:0.6b
```

- [ ] **Step 2: Create docker-compose.yml**

```yaml
services:
  server:
    build: .
    ports:
      - "${LOGD_PORT:-3000}:3000"
    volumes:
      - logd-data:/data
    environment:
      LOGD_DB_PATH: /data/logd-server.db
      LOGD_API_TOKEN: ${LOGD_API_TOKEN}
      LOGD_OLLAMA_URL: ${LOGD_OLLAMA_URL:-http://ollama:11434}
      LOGD_MODEL: ${LOGD_MODEL:-qwen3-embedding:0.6b}
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://localhost:3000/health').then(r=>{if(!r.ok)throw 1})"]
      interval: 30s
      timeout: 5s
      retries: 3
    restart: unless-stopped

  ollama:
    image: ollama/ollama
    profiles: ["full"]
    ports:
      - "11434:11434"
    volumes:
      - ollama-data:/root/.ollama
    restart: unless-stopped

volumes:
  logd-data:
  ollama-data:
```

- [ ] **Step 3: Verify compose config parses**

Run: `docker compose config`
Expected: Outputs resolved config without errors

- [ ] **Step 4: Commit**

```bash
git add .env.example docker-compose.yml
git commit -m "feat: docker-compose with optional Ollama sidecar"
```

---

### Task 8: Server README

**Files:**
- Create: `packages/server/README.md`

- [ ] **Step 1: Write server README**

```markdown
# @logd/server

REST API server for team-based decision logging with semantic search.

## Quick Start (Docker)

1. Copy and configure environment:

   ```bash
   cp .env.example .env
   # Edit .env — set LOGD_API_TOKEN to a secure value
   ```

2. Start the server:

   ```bash
   # With your own Ollama instance
   docker compose up -d

   # Or bundled with Ollama
   docker compose --profile full up -d
   ```

3. Verify it's running:

   ```bash
   curl http://localhost:3000/health
   curl http://localhost:3000/health/ready
   ```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `LOGD_PORT` | `3000` | Server port |
| `LOGD_API_TOKEN` | — | Auth token (required on first run to create admin) |
| `LOGD_DB_PATH` | `./logd-server.db` | SQLite database path |
| `LOGD_OLLAMA_URL` | `http://localhost:11434` | Ollama endpoint |
| `LOGD_MODEL` | `qwen3-embedding:0.6b` | Embedding model |

## Development

```bash
npm run dev          # Start with hot reload
npm test             # Run tests
```

See [self-hosting guide](../../docs/self-hosting.md) for detailed deployment instructions.
```

- [ ] **Step 2: Commit**

```bash
git add packages/server/README.md
git commit -m "docs: server README with quick start"
```

---

### Task 9: Self-Hosting Guide

**Files:**
- Create: `docs/self-hosting.md`

- [ ] **Step 1: Write self-hosting guide**

```markdown
# Self-Hosting logd

## Architecture

logd server is a Node.js HTTP API backed by SQLite (with sqlite-vec for vector search) and Ollama for embeddings.

```
┌─────────┐     ┌──────────┐     ┌────────┐
│  CLI /  │────▶│  logd    │────▶│ Ollama │
│  MCP    │     │  server  │     │        │
└─────────┘     └────┬─────┘     └────────┘
                     │
                ┌────▼─────┐
                │  SQLite  │
                │ +vec ext │
                └──────────┘
```

## Prerequisites

- Docker and Docker Compose
- (Optional) Ollama — bundled via compose profile or bring your own

## Setup

### 1. Clone and configure

```bash
git clone https://github.com/tonytangdev/logd.git
cd logd
cp .env.example .env
```

Edit `.env`:
- `LOGD_API_TOKEN` — set a strong secret. Required on first run to create the admin user and token.
- `LOGD_OLLAMA_URL` — if using an external Ollama instance, set its URL here.

### 2. Start services

**Option A: Server only** (bring your own Ollama)

```bash
docker compose up -d
```

**Option B: Server + Ollama** (fully self-contained)

```bash
docker compose --profile full up -d
# Pull the embedding model
docker compose exec ollama ollama pull qwen3-embedding:0.6b
```

### 3. Verify

```bash
# Liveness
curl http://localhost:3000/health

# Readiness (checks DB + Ollama)
curl http://localhost:3000/health/ready
```

## Connecting the CLI

```bash
# Store credentials
logd login http://your-server:3000 --token YOUR_API_TOKEN

# Create a remote project
logd project create my-project --server http://your-server:3000 --team default

# Use normally — decisions sync to server
logd add "Use Redis for caching" -p my-project
```

## Data & Backups

Data is stored in a Docker volume (`logd-data`). To back up:

```bash
# Copy the SQLite database out of the volume
docker compose cp server:/data/logd-server.db ./backup.db
```

To restore, copy the file back and restart.

## Volumes

| Volume | Purpose |
|--------|---------|
| `logd-data` | SQLite database |
| `ollama-data` | Ollama models (only with `full` profile) |

## Troubleshooting

**`/health/ready` shows `ollama: "error"`**
- Check Ollama is running: `curl http://localhost:11434/api/tags`
- If using the sidecar, ensure you pulled the model: `docker compose exec ollama ollama pull qwen3-embedding:0.6b`
- If using external Ollama, verify `LOGD_OLLAMA_URL` in `.env`

**Bootstrap didn't create admin user**
- `LOGD_API_TOKEN` must be set on the very first run. If the DB already exists, delete the volume and restart: `docker compose down -v && docker compose up -d`

**Permission errors on volume**
- Ensure the data directory is writable. The container runs as the default node user.
```

- [ ] **Step 2: Commit**

```bash
git add docs/self-hosting.md
git commit -m "docs: self-hosting guide"
```

---

### Task 10: Update Root README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add self-hosting section after the "Configuration" section**

Insert before `## Architecture`:

```markdown
## Team Use

logd is local-first — everything works offline with your own Ollama instance. For teams, you have two options:

- **Self-host** — run the logd server on your own infrastructure. See the [self-hosting guide](docs/self-hosting.md).
- **Hosted** — use the managed service at [logd.dev](https://logd.dev) (coming soon).

Both options let you share decisions across team members via `logd login` and remote projects.
```

- [ ] **Step 2: Run format check**

Run: `npx biome check .`
Expected: no errors in modified files

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add team use section to root README"
```

---

### Task 11: Docker Build Smoke Test

**Files:** None (validation only)

- [ ] **Step 1: Build the Docker image**

Run: `docker build -t logd-server .`
Expected: Builds successfully with no errors

- [ ] **Step 2: Start with compose and test health**

```bash
cp .env.example .env
# Set a real token
echo "LOGD_API_TOKEN=test-token-123" >> .env
docker compose up -d
sleep 5
curl -s http://localhost:3000/health
```

Expected: `{"status":"ok"}`

- [ ] **Step 3: Verify readiness endpoint responds (503 ok if no Ollama)**

```bash
curl -s http://localhost:3000/health/ready
```

Expected: `{"status":"not_ready","db":"ok","ollama":"error"}` (503, expected without Ollama)

- [ ] **Step 4: Clean up**

```bash
docker compose down -v
rm .env
```

- [ ] **Step 5: Run all server tests one final time**

Run: `npm test -w packages/server`
Expected: all PASS

- [ ] **Step 6: Run lint/typecheck**

Run: `npx biome check . && npm run typecheck -w packages/server`
Expected: clean
