# Backend Abstraction + Remote Project Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor logd CLI to route decisions through a backend interface — local SQLite (default) or remote HTTP — based on per-project config.

**Architecture:** Backend interface (`DecisionBackend`) with local and remote implementations. `BackendFactory` resolves backend per project. Project records gain `server`/`team` fields. Credential store manages API tokens. Search split into `LocalDecisionSearch`/`RemoteDecisionSearch` due to different input types (vector vs text).

**Tech Stack:** TypeScript, better-sqlite3, Commander.js, Vitest, node:fs for credentials

**Spec:** `docs/superpowers/specs/2026-03-29-backend-abstraction-remote-projects-design.md` (GitHub issue #29)

**Known limitations (by design):**
- `getById`, `update`, `delete` without a project param only search local backend. Remote decisions require specifying a project. This is acceptable for Phase 1 — remote decisions are always project-scoped.
- `list` without `-p` only returns local decisions.
- `IDecisionRepo` (sync) is kept alongside `DecisionBackend` (async). The sync interface is still used by `LocalDecisionBackend` internally. No deprecation needed — they serve different layers.

---

### Task 1: Add `server`/`team` columns to Project type and DB

**Files:**
- Modify: `src/core/types.ts:22-27`
- Modify: `src/infra/db.ts:28-53`
- Modify: `src/infra/project.repo.ts`
- Modify: `src/core/project.service.ts`
- Modify: `src/infra/db.test.ts`
- Modify: `src/infra/project.repo.test.ts`
- Modify: `src/core/project.service.test.ts`
- Modify: `src/core/decision.service.test.ts`
- Modify: `src/core/types.test.ts`
- Modify: `src/mcp/server.test.ts`

- [ ] **Step 1: Write failing test for new DB columns**

In `src/infra/db.test.ts`, add inside the describe block:

```typescript
it("creates projects table with server and team columns", () => {
  const db = createDatabase(join(tempDir, "test.db"));
  const columns = db.pragma("table_info(projects)") as { name: string }[];
  const names = columns.map((c: { name: string }) => c.name);
  expect(names).toContain("server");
  expect(names).toContain("team");
  db.close();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/infra/db.test.ts --reporter=verbose`
Expected: FAIL — `server` and `team` columns not found

- [ ] **Step 3: Update Project type**

In `src/core/types.ts`, update the `Project` interface:

```typescript
export interface Project {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  server: string | null;
  team: string | null;
}
```

- [ ] **Step 4: Update DB schema — both CREATE TABLE and migration**

In `src/infra/db.ts`, update the CREATE TABLE statement inside `db.exec()` to include the new columns for fresh databases:

```sql
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  server TEXT DEFAULT NULL,
  team TEXT DEFAULT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

Then, **after** the `db.exec(...)` call (before `return db;`), add migration for existing databases:

```typescript
// Migration: add server/team columns to projects (for existing databases)
const projectColumns = db.pragma("table_info(projects)") as { name: string }[];
const columnNames = projectColumns.map((c) => c.name);
if (!columnNames.includes("server")) {
  db.exec("ALTER TABLE projects ADD COLUMN server TEXT DEFAULT NULL");
}
if (!columnNames.includes("team")) {
  db.exec("ALTER TABLE projects ADD COLUMN team TEXT DEFAULT NULL");
}
```

- [ ] **Step 5: Update ProjectRepo to read/write server and team**

In `src/infra/project.repo.ts`:

Update `ProjectRow`:
```typescript
interface ProjectRow {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  server: string | null;
  team: string | null;
}
```

Update `rowToProject`:
```typescript
function rowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
    server: row.server ?? null,
    team: row.team ?? null,
  };
}
```

Update `create`:
```typescript
create(project: Project): void {
  this.db
    .prepare(
      "INSERT INTO projects (id, name, description, server, team, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(project.id, project.name, project.description, project.server, project.team, project.createdAt);
}
```

Update `findByName` SELECT to: `SELECT id, name, description, server, team, created_at FROM projects WHERE LOWER(name) = LOWER(?)`

Update `list` SELECT to: `SELECT id, name, description, server, team, created_at FROM projects ORDER BY name`

- [ ] **Step 6: Update ProjectService.create**

In `src/core/project.service.ts`, update the project object construction:

```typescript
const project: Project = {
  id: randomUUID(),
  name: normalized,
  description: description ?? null,
  createdAt: new Date().toISOString(),
  server: null,
  team: null,
};
```

- [ ] **Step 7: Fix ALL test files that construct Project objects**

Every test file that creates a `Project` literal must include `server: null, team: null`.

In `src/core/types.test.ts`, update the "Project has all required fields" test:
```typescript
it("Project has all required fields", () => {
  const project: Project = {
    id: "uuid",
    name: "myproject",
    description: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    server: null,
    team: null,
  };
  expect(project.name).toBe("myproject");
});
```

In `src/core/decision.service.test.ts`, update `testProject`:
```typescript
const testProject: Project = {
  id: "proj-1",
  name: "testproject",
  description: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  server: null,
  team: null,
};
```

In `src/infra/project.repo.test.ts`, update all `Project` literals to include `server: null, team: null`. Add a new test:
```typescript
it("stores and retrieves server and team", () => {
  const project: Project = {
    id: "p1",
    name: "remote-proj",
    description: null,
    createdAt: new Date().toISOString(),
    server: "https://api.example.com",
    team: "acme",
  };
  repo.create(project);
  const found = repo.findByName("remote-proj");
  expect(found?.server).toBe("https://api.example.com");
  expect(found?.team).toBe("acme");
});
```

Check `src/mcp/server.test.ts` and any other test files for `Project` literals and fix them too.

- [ ] **Step 8: Run all tests**

Run: `npx vitest run --reporter=verbose`
Expected: ALL PASS

- [ ] **Step 9: Commit**

```bash
git add src/core/types.ts src/core/types.test.ts src/infra/db.ts src/infra/db.test.ts src/infra/project.repo.ts src/infra/project.repo.test.ts src/core/project.service.ts src/core/project.service.test.ts src/core/decision.service.test.ts src/mcp/server.test.ts
git commit -m "feat: add server/team columns to Project type and DB"
```

---

### Task 2: Define DecisionBackend and search interfaces

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/core/types.test.ts`

- [ ] **Step 1: Write failing type test**

In `src/core/types.test.ts`, add imports and a new describe block:

```typescript
// Add to imports:
import type { DecisionBackend, LocalDecisionSearch, RemoteDecisionSearch } from "./types.js";

// Add describe block:
describe("backend interfaces", () => {
  it("DecisionBackend has required methods", () => {
    const _check = (backend: DecisionBackend) => {
      backend.create({} as Decision, []);
      backend.findById("id");
      backend.update("id", {});
      backend.delete("id");
      backend.list();
    };
    expect(_check).toBeDefined();
  });

  it("LocalDecisionSearch has searchByVector", () => {
    const _check = (search: LocalDecisionSearch) => {
      search.searchByVector([], 10);
    };
    expect(_check).toBeDefined();
  });

  it("RemoteDecisionSearch has searchByQuery", () => {
    const _check = (search: RemoteDecisionSearch) => {
      search.searchByQuery("proj", "query", 0.5, 10);
    };
    expect(_check).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/types.test.ts --reporter=verbose`
Expected: FAIL — types don't exist yet

- [ ] **Step 3: Add interfaces to types.ts**

In `src/core/types.ts`, after `IDecisionRepo`, add:

```typescript
export interface DecisionBackend {
  create(decision: Decision, embedding: number[]): Promise<void>;
  findById(id: string): Promise<Decision | null>;
  update(id: string, input: UpdateDecisionInput, embedding?: number[]): Promise<void>;
  delete(id: string): Promise<void>;
  list(options?: {
    project?: string;
    status?: DecisionStatus;
    limit?: number;
  }): Promise<Decision[]>;
}

export interface LocalDecisionSearch {
  searchByVector(
    embedding: number[],
    limit: number,
    project?: string,
  ): Promise<SearchResult[]>;
}

export interface RemoteDecisionSearch {
  searchByQuery(
    project: string,
    query: string,
    threshold: number,
    limit: number,
  ): Promise<SearchResult[]>;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/types.test.ts --reporter=verbose`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/types.ts src/core/types.test.ts
git commit -m "feat: define DecisionBackend and search interfaces"
```

---

### Task 3: Implement LocalDecisionBackend (wrap existing repo)

**Files:**
- Create: `src/infra/local.decision.backend.ts`
- Create: `src/infra/local.decision.backend.test.ts`

- [ ] **Step 1: Write failing test**

Create `src/infra/local.decision.backend.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Decision, IDecisionRepo } from "../core/types.js";
import { LocalDecisionBackend } from "./local.decision.backend.js";

function makeDecision(id: string): Decision {
  return {
    id,
    project: "test",
    title: "Test",
    context: null,
    alternatives: null,
    tags: null,
    status: "active",
    links: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("LocalDecisionBackend", () => {
  let repo: IDecisionRepo;
  let backend: LocalDecisionBackend;

  beforeEach(() => {
    repo = {
      create: vi.fn(),
      findById: vi.fn(() => makeDecision("d1")),
      update: vi.fn(),
      delete: vi.fn(),
      list: vi.fn(() => [makeDecision("d1")]),
      searchByVector: vi.fn(() => [{ decision: makeDecision("d1"), score: 0.9 }]),
    };
    backend = new LocalDecisionBackend(repo);
  });

  it("create delegates to repo and returns promise", async () => {
    const decision = makeDecision("d1");
    await backend.create(decision, [0.1]);
    expect(repo.create).toHaveBeenCalledWith(decision, [0.1]);
  });

  it("findById delegates to repo", async () => {
    const result = await backend.findById("d1");
    expect(result).toEqual(makeDecision("d1"));
  });

  it("update delegates to repo", async () => {
    await backend.update("d1", { title: "New" }, [0.2]);
    expect(repo.update).toHaveBeenCalledWith("d1", { title: "New" }, [0.2]);
  });

  it("delete delegates to repo", async () => {
    await backend.delete("d1");
    expect(repo.delete).toHaveBeenCalledWith("d1");
  });

  it("list delegates to repo", async () => {
    const results = await backend.list({ project: "test" });
    expect(results).toHaveLength(1);
  });

  it("searchByVector delegates to repo", async () => {
    const results = await backend.searchByVector([0.1], 5, "test");
    expect(results).toHaveLength(1);
    expect(results[0].score).toBe(0.9);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/infra/local.decision.backend.test.ts --reporter=verbose`
Expected: FAIL — module not found

- [ ] **Step 3: Implement LocalDecisionBackend**

Create `src/infra/local.decision.backend.ts`:

```typescript
import type {
  Decision,
  DecisionBackend,
  DecisionStatus,
  IDecisionRepo,
  LocalDecisionSearch,
  SearchResult,
  UpdateDecisionInput,
} from "../core/types.js";

export class LocalDecisionBackend implements DecisionBackend, LocalDecisionSearch {
  constructor(private repo: IDecisionRepo) {}

  async create(decision: Decision, embedding: number[]): Promise<void> {
    this.repo.create(decision, embedding);
  }

  async findById(id: string): Promise<Decision | null> {
    return this.repo.findById(id);
  }

  async update(id: string, input: UpdateDecisionInput, embedding?: number[]): Promise<void> {
    this.repo.update(id, input, embedding);
  }

  async delete(id: string): Promise<void> {
    this.repo.delete(id);
  }

  async list(options?: { project?: string; status?: DecisionStatus; limit?: number }): Promise<Decision[]> {
    return this.repo.list(options);
  }

  async searchByVector(embedding: number[], limit: number, project?: string): Promise<SearchResult[]> {
    return this.repo.searchByVector(embedding, limit, project);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/infra/local.decision.backend.test.ts --reporter=verbose`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/infra/local.decision.backend.ts src/infra/local.decision.backend.test.ts
git commit -m "feat: implement LocalDecisionBackend wrapping sync repo"
```

---

### Task 4: Implement CredentialStore

**Files:**
- Create: `src/infra/credentials.ts`
- Create: `src/infra/credentials.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/infra/credentials.test.ts`:

```typescript
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CredentialStore } from "./credentials.js";

describe("CredentialStore", () => {
  let tempDir: string;
  let store: CredentialStore;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "logd-creds-"));
    store = new CredentialStore(join(tempDir, "credentials.json"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns null for unknown server", () => {
    expect(store.getToken("https://unknown.com")).toBeNull();
  });

  it("saves and retrieves a token", () => {
    store.setToken("https://api.example.com", "my-token");
    expect(store.getToken("https://api.example.com")).toBe("my-token");
  });

  it("persists across instances", () => {
    store.setToken("https://api.example.com", "my-token");
    const store2 = new CredentialStore(join(tempDir, "credentials.json"));
    expect(store2.getToken("https://api.example.com")).toBe("my-token");
  });

  it("removes a token", () => {
    store.setToken("https://api.example.com", "my-token");
    store.removeToken("https://api.example.com");
    expect(store.getToken("https://api.example.com")).toBeNull();
  });

  it("lists all servers", () => {
    store.setToken("https://a.com", "t1");
    store.setToken("https://b.com", "t2");
    expect(store.listServers()).toEqual(["https://a.com", "https://b.com"]);
  });

  it("returns empty list when no servers", () => {
    expect(store.listServers()).toEqual([]);
  });

  it("creates file with 0600 permissions on unix", () => {
    store.setToken("https://api.example.com", "token");
    const stats = statSync(join(tempDir, "credentials.json"));
    expect(stats.mode & 0o777).toBe(0o600);
  });

  it("falls back to LOGD_TOKEN env var when no stored token", () => {
    const original = process.env.LOGD_TOKEN;
    process.env.LOGD_TOKEN = "env-token";
    try {
      expect(store.getToken("https://any-server.com")).toBe("env-token");
    } finally {
      if (original !== undefined) {
        process.env.LOGD_TOKEN = original;
      } else {
        delete process.env.LOGD_TOKEN;
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/infra/credentials.test.ts --reporter=verbose`
Expected: FAIL — module not found

- [ ] **Step 3: Implement CredentialStore**

Create `src/infra/credentials.ts`:

```typescript
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

interface CredentialsFile {
  servers: Record<string, { token: string }>;
}

export class CredentialStore {
  constructor(private filePath: string) {}

  getToken(serverUrl: string): string | null {
    const data = this.read();
    const entry = data.servers[serverUrl];
    if (entry) return entry.token;
    return process.env.LOGD_TOKEN ?? null;
  }

  setToken(serverUrl: string, token: string): void {
    const data = this.read();
    data.servers[serverUrl] = { token };
    this.write(data);
  }

  removeToken(serverUrl: string): void {
    const data = this.read();
    delete data.servers[serverUrl];
    this.write(data);
  }

  listServers(): string[] {
    const data = this.read();
    return Object.keys(data.servers);
  }

  private read(): CredentialsFile {
    if (!existsSync(this.filePath)) {
      return { servers: {} };
    }
    return JSON.parse(readFileSync(this.filePath, "utf-8")) as CredentialsFile;
  }

  private write(data: CredentialsFile): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(data, null, 2), { mode: 0o600 });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/infra/credentials.test.ts --reporter=verbose`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/infra/credentials.ts src/infra/credentials.test.ts
git commit -m "feat: implement CredentialStore for API token management"
```

---

### Task 5: Implement RemoteClient

**Files:**
- Create: `src/infra/remote.client.ts`
- Create: `src/infra/remote.client.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/infra/remote.client.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RemoteClient } from "./remote.client.js";

describe("RemoteClient", () => {
  let client: RemoteClient;

  beforeEach(() => {
    client = new RemoteClient("https://api.example.com", "test-token", "acme");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends auth and team headers", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ id: "d1", project: "proj", title: "T", context: null, alternatives: null, tags: null, status: "active", links: null, createdAt: "2026-01-01", updatedAt: "2026-01-01" }), { status: 200 }),
    );
    await client.createDecision("proj", { project: "proj", title: "T" });
    expect(fetch).toHaveBeenCalledWith(
      "https://api.example.com/decisions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-token",
          "X-Team": "acme",
        }),
      }),
    );
  });

  it("throws on 401", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("", { status: 401 }));
    await expect(client.validateToken()).rejects.toThrow("token expired");
  });

  it("throws on 403", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("", { status: 403 }));
    await expect(client.validateToken()).rejects.toThrow("not a member of this team");
  });

  it("throws connection error when fetch fails", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(client.validateToken()).rejects.toThrow("Cannot reach server");
  });

  it("searchDecisions sends query string not embedding", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
    await client.searchDecisions("proj", "why postgres?", 0.5, 5);
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string);
    expect(body.query).toBe("why postgres?");
    expect(body).not.toHaveProperty("embedding");
  });

  it("validateToken returns true on 200", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("OK", { status: 200 }));
    expect(await client.validateToken()).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/infra/remote.client.test.ts --reporter=verbose`
Expected: FAIL — module not found

- [ ] **Step 3: Implement RemoteClient**

Create `src/infra/remote.client.ts`:

```typescript
import type {
  CreateDecisionInput,
  Decision,
  DecisionStatus,
  SearchResult,
  UpdateDecisionInput,
} from "../core/types.js";

export class RemoteClient {
  constructor(
    private baseUrl: string,
    private token: string,
    private team: string,
  ) {}

  async createDecision(project: string, input: CreateDecisionInput): Promise<Decision> {
    return this.request<Decision>("POST", "/decisions", { ...input, project });
  }

  async getDecision(id: string): Promise<Decision | null> {
    try {
      return await this.request<Decision>("GET", `/decisions/${id}`);
    } catch (e) {
      if ((e as Error).message.includes("404")) return null;
      throw e;
    }
  }

  async updateDecision(id: string, input: UpdateDecisionInput): Promise<void> {
    await this.request<void>("PATCH", `/decisions/${id}`, input);
  }

  async deleteDecision(id: string): Promise<void> {
    await this.request<void>("DELETE", `/decisions/${id}`);
  }

  async listDecisions(options?: {
    project?: string;
    status?: DecisionStatus;
    limit?: number;
  }): Promise<Decision[]> {
    const params = new URLSearchParams();
    if (options?.project) params.set("project", options.project);
    if (options?.status) params.set("status", options.status);
    if (options?.limit) params.set("limit", String(options.limit));
    const qs = params.toString();
    return this.request<Decision[]>("GET", `/decisions${qs ? `?${qs}` : ""}`);
  }

  async searchDecisions(
    project: string,
    query: string,
    threshold: number,
    limit: number,
  ): Promise<SearchResult[]> {
    return this.request<SearchResult[]>("POST", "/decisions/search", {
      project,
      query,
      threshold,
      limit,
    });
  }

  async createProject(name: string, description?: string): Promise<void> {
    await this.request<void>("POST", "/projects", { name, description });
  }

  async validateToken(): Promise<boolean> {
    await this.request<unknown>("GET", "/auth/validate");
    return true;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.token}`,
          "X-Team": this.team,
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new Error(`Cannot reach server at ${this.baseUrl}. Check your connection.`);
    }

    if (response.status === 401) {
      throw new Error("Authentication failed: token expired or invalid. Run `logd login` to re-authenticate.");
    }
    if (response.status === 403) {
      throw new Error("Access denied: not a member of this team.");
    }
    if (!response.ok) {
      throw new Error(`Server error: ${response.status} ${response.statusText}`);
    }

    const text = await response.text();
    return text ? (JSON.parse(text) as T) : (undefined as T);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/infra/remote.client.test.ts --reporter=verbose`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/infra/remote.client.ts src/infra/remote.client.test.ts
git commit -m "feat: implement RemoteClient for server API communication"
```

---

### Task 6: Implement RemoteDecisionBackend

**Files:**
- Create: `src/infra/remote.decision.backend.ts`
- Create: `src/infra/remote.decision.backend.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/infra/remote.decision.backend.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Decision } from "../core/types.js";
import { RemoteClient } from "./remote.client.js";
import { RemoteDecisionBackend } from "./remote.decision.backend.js";

vi.mock("./remote.client.js");

function makeDecision(id: string): Decision {
  return {
    id, project: "test", title: "Test", context: null,
    alternatives: null, tags: null, status: "active", links: null,
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("RemoteDecisionBackend", () => {
  let client: RemoteClient;
  let backend: RemoteDecisionBackend;

  beforeEach(() => {
    client = new RemoteClient("https://api.example.com", "token", "team");
    client.createDecision = vi.fn();
    client.getDecision = vi.fn().mockResolvedValue(makeDecision("d1"));
    client.updateDecision = vi.fn();
    client.deleteDecision = vi.fn();
    client.listDecisions = vi.fn().mockResolvedValue([makeDecision("d1")]);
    client.searchDecisions = vi.fn().mockResolvedValue([]);
    backend = new RemoteDecisionBackend(client);
  });

  it("create sends decision data, ignores embedding", async () => {
    await backend.create(makeDecision("d1"), [0.1, 0.2]);
    expect(client.createDecision).toHaveBeenCalledWith("test", expect.objectContaining({
      project: "test",
      title: "Test",
      status: "active",
    }));
  });

  it("findById delegates to client", async () => {
    const result = await backend.findById("d1");
    expect(result).toEqual(makeDecision("d1"));
  });

  it("update delegates to client, ignores embedding", async () => {
    await backend.update("d1", { title: "New" }, [0.2]);
    expect(client.updateDecision).toHaveBeenCalledWith("d1", { title: "New" });
  });

  it("delete delegates to client", async () => {
    await backend.delete("d1");
    expect(client.deleteDecision).toHaveBeenCalledWith("d1");
  });

  it("list delegates to client", async () => {
    const results = await backend.list({ project: "test" });
    expect(results).toHaveLength(1);
  });

  it("searchByQuery delegates to client", async () => {
    await backend.searchByQuery("test", "why postgres?", 0.5, 10);
    expect(client.searchDecisions).toHaveBeenCalledWith("test", "why postgres?", 0.5, 10);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/infra/remote.decision.backend.test.ts --reporter=verbose`
Expected: FAIL — module not found

- [ ] **Step 3: Implement RemoteDecisionBackend**

Create `src/infra/remote.decision.backend.ts`:

```typescript
import type {
  CreateDecisionInput,
  Decision,
  DecisionBackend,
  DecisionStatus,
  RemoteDecisionSearch,
  SearchResult,
  UpdateDecisionInput,
} from "../core/types.js";
import type { RemoteClient } from "./remote.client.js";

export class RemoteDecisionBackend implements DecisionBackend, RemoteDecisionSearch {
  constructor(private client: RemoteClient) {}

  async create(decision: Decision, _embedding: number[]): Promise<void> {
    const input: CreateDecisionInput = {
      project: decision.project,
      title: decision.title,
      context: decision.context ?? undefined,
      alternatives: decision.alternatives ?? undefined,
      tags: decision.tags ?? undefined,
      status: decision.status,
      links: decision.links ?? undefined,
    };
    await this.client.createDecision(decision.project, input);
  }

  async findById(id: string): Promise<Decision | null> {
    return this.client.getDecision(id);
  }

  async update(id: string, input: UpdateDecisionInput, _embedding?: number[]): Promise<void> {
    await this.client.updateDecision(id, input);
  }

  async delete(id: string): Promise<void> {
    await this.client.deleteDecision(id);
  }

  async list(options?: { project?: string; status?: DecisionStatus; limit?: number }): Promise<Decision[]> {
    return this.client.listDecisions(options);
  }

  async searchByQuery(project: string, query: string, threshold: number, limit: number): Promise<SearchResult[]> {
    return this.client.searchDecisions(project, query, threshold, limit);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/infra/remote.decision.backend.test.ts --reporter=verbose`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/infra/remote.decision.backend.ts src/infra/remote.decision.backend.test.ts
git commit -m "feat: implement RemoteDecisionBackend via RemoteClient"
```

---

### Task 7: Implement BackendFactory

**Files:**
- Create: `src/core/backend.factory.ts`
- Create: `src/core/backend.factory.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/core/backend.factory.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EmbeddingService } from "./embedding.service.js";
import type { IDecisionRepo, Project } from "./types.js";
import { BackendFactory } from "./backend.factory.js";
import { LocalDecisionBackend } from "../infra/local.decision.backend.js";
import { RemoteDecisionBackend } from "../infra/remote.decision.backend.js";
import { CredentialStore } from "../infra/credentials.js";

vi.mock("../infra/credentials.js");
vi.mock("../infra/remote.decision.backend.js");

const localProject: Project = {
  id: "p1", name: "local-proj", description: null,
  createdAt: "2026-01-01", server: null, team: null,
};

const remoteProject: Project = {
  id: "p2", name: "remote-proj", description: null,
  createdAt: "2026-01-01", server: "https://api.example.com", team: "acme",
};

describe("BackendFactory", () => {
  let decisionRepo: IDecisionRepo;
  let credentialStore: CredentialStore;
  let embeddingService: EmbeddingService;
  let factory: BackendFactory;

  beforeEach(() => {
    decisionRepo = {
      create: vi.fn(), findById: vi.fn(), update: vi.fn(),
      delete: vi.fn(), list: vi.fn(), searchByVector: vi.fn(),
    };
    credentialStore = new CredentialStore("/tmp/fake");
    credentialStore.getToken = vi.fn().mockReturnValue("test-token");
    embeddingService = { embedDecision: vi.fn(), embedQuery: vi.fn() } as unknown as EmbeddingService;
    factory = new BackendFactory(decisionRepo, credentialStore, embeddingService);
  });

  it("returns local backend for local project", () => {
    const result = factory.forProject(localProject);
    expect(result.decisions).toBeInstanceOf(LocalDecisionBackend);
    expect(result.embeddings).toBe(embeddingService);
  });

  it("returns remote backend for remote project", () => {
    const result = factory.forProject(remoteProject);
    expect(result.decisions).toBeInstanceOf(RemoteDecisionBackend);
    expect(result.embeddings).toBeNull();
  });

  it("throws when no token for remote project", () => {
    credentialStore.getToken = vi.fn().mockReturnValue(null);
    expect(() => factory.forProject(remoteProject)).toThrow("logd login");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/backend.factory.test.ts --reporter=verbose`
Expected: FAIL — module not found

- [ ] **Step 3: Implement BackendFactory**

Create `src/core/backend.factory.ts`:

```typescript
import type { EmbeddingService } from "./embedding.service.js";
import type {
  DecisionBackend,
  IDecisionRepo,
  LocalDecisionSearch,
  Project,
  RemoteDecisionSearch,
} from "./types.js";
import type { CredentialStore } from "../infra/credentials.js";
import { LocalDecisionBackend } from "../infra/local.decision.backend.js";
import { RemoteDecisionBackend } from "../infra/remote.decision.backend.js";
import { RemoteClient } from "../infra/remote.client.js";

export interface BackendResult {
  decisions: DecisionBackend;
  search: LocalDecisionSearch | RemoteDecisionSearch;
  embeddings: EmbeddingService | null;
}

export class BackendFactory {
  constructor(
    private localDecisionRepo: IDecisionRepo,
    private credentialStore: CredentialStore,
    private embeddingService: EmbeddingService,
  ) {}

  forProject(project: Project): BackendResult {
    if (!project.server) {
      const backend = new LocalDecisionBackend(this.localDecisionRepo);
      return { decisions: backend, search: backend, embeddings: this.embeddingService };
    }

    const token = this.credentialStore.getToken(project.server);
    if (!token) {
      throw new Error(
        `No token for server ${project.server}. Run: logd login ${project.server} --token <token>`,
      );
    }

    const client = new RemoteClient(project.server, token, project.team!);
    const backend = new RemoteDecisionBackend(client);
    return { decisions: backend, search: backend, embeddings: null };
  }

  /** Get local backend without a specific project (for ID-based lookups) */
  localBackend(): { decisions: DecisionBackend; search: LocalDecisionSearch; embeddings: EmbeddingService } {
    const backend = new LocalDecisionBackend(this.localDecisionRepo);
    return { decisions: backend, search: backend, embeddings: this.embeddingService };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/backend.factory.test.ts --reporter=verbose`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/backend.factory.ts src/core/backend.factory.test.ts
git commit -m "feat: implement BackendFactory resolving local vs remote per project"
```

---

### Task 8: Refactor DecisionService + update CLI wiring + fix all tests

This is a single task to avoid a broken intermediate state. The `DecisionService` constructor changes, so `src/cli/index.ts` must be updated in the same task.

**Files:**
- Modify: `src/core/decision.service.ts`
- Modify: `src/core/decision.service.test.ts`
- Modify: `src/cli/index.ts`
- Modify: any CLI/MCP test files that construct `DecisionService` directly

- [ ] **Step 1: Refactor DecisionService**

Replace `src/core/decision.service.ts` with:

```typescript
import { randomUUID } from "node:crypto";
import type { BackendFactory } from "./backend.factory.js";
import type {
  CreateDecisionInput,
  Decision,
  DecisionStatus,
  IProjectRepo,
  LocalDecisionSearch,
  Project,
  RemoteDecisionSearch,
  SearchInput,
  SearchResult,
  UpdateDecisionInput,
} from "./types.js";

export class DecisionService {
  constructor(
    private projectRepo: IProjectRepo,
    private backendFactory: BackendFactory,
  ) {}

  async create(input: CreateDecisionInput): Promise<Decision> {
    const project = this.resolveProject(input.project);
    const { decisions, embeddings } = this.backendFactory.forProject(project);

    const now = new Date().toISOString();
    const decision: Decision = {
      id: randomUUID(),
      project: input.project,
      title: input.title,
      context: input.context ?? null,
      alternatives: input.alternatives ?? null,
      tags: input.tags ?? null,
      status: input.status ?? "active",
      links: input.links ?? null,
      createdAt: now,
      updatedAt: now,
    };

    const embedding = embeddings ? await embeddings.embedDecision(decision) : [];
    await decisions.create(decision, embedding);
    return decision;
  }

  async getById(id: string): Promise<Decision> {
    const decision = await this.backendFactory.localBackend().decisions.findById(id);
    if (!decision) {
      throw new Error(`Decision '${id}' not found`);
    }
    return decision;
  }

  async update(id: string, input: UpdateDecisionInput): Promise<Decision> {
    const existing = await this.backendFactory.localBackend().decisions.findById(id);
    if (!existing) {
      throw new Error(`Decision '${id}' not found`);
    }

    if (input.project !== undefined) {
      this.resolveProject(input.project);
    }

    const project = this.projectRepo.findByName(existing.project);
    const { decisions, embeddings } = this.backendFactory.forProject(project!);

    const updated: Decision = {
      ...existing,
      project: input.project !== undefined ? input.project : existing.project,
      title: input.title !== undefined ? input.title : existing.title,
      context: input.context !== undefined ? input.context : existing.context,
      alternatives: input.alternatives !== undefined ? input.alternatives : existing.alternatives,
      tags: input.tags !== undefined ? input.tags : existing.tags,
      status: input.status !== undefined ? input.status : existing.status,
      links: input.links !== undefined ? input.links : existing.links,
      updatedAt: new Date(
        Math.max(Date.now(), new Date(existing.updatedAt).getTime() + 1),
      ).toISOString(),
    };

    const embedding = embeddings ? await embeddings.embedDecision(updated) : undefined;
    await decisions.update(id, input, embedding);
    return updated;
  }

  async delete(id: string): Promise<void> {
    const decision = await this.backendFactory.localBackend().decisions.findById(id);
    if (!decision) {
      throw new Error(`Decision '${id}' not found`);
    }
    const project = this.projectRepo.findByName(decision.project);
    const { decisions } = this.backendFactory.forProject(project!);
    await decisions.delete(id);
  }

  async list(options: {
    project?: string;
    status?: DecisionStatus;
    limit?: number;
  }): Promise<Decision[]> {
    if (options.project) {
      const project = this.resolveProject(options.project);
      const { decisions } = this.backendFactory.forProject(project);
      return decisions.list({
        project: options.project,
        status: options.status,
        limit: options.limit ?? 20,
      });
    }
    return this.backendFactory.localBackend().decisions.list({
      status: options.status,
      limit: options.limit ?? 20,
    });
  }

  async search(input: SearchInput): Promise<SearchResult[]> {
    const limit = input.limit ?? 5;
    const threshold = input.threshold ?? 0;

    if (input.project) {
      const project = this.resolveProject(input.project);
      const { search, embeddings } = this.backendFactory.forProject(project);

      if (embeddings && "searchByVector" in search) {
        return this.localSearch(search as LocalDecisionSearch, embeddings, input);
      }
      return (search as RemoteDecisionSearch).searchByQuery(
        input.project, input.query, threshold, limit,
      );
    }

    // No project — search local only
    const { search, embeddings } = this.backendFactory.localBackend();
    return this.localSearch(search, embeddings, input);
  }

  private async localSearch(
    search: LocalDecisionSearch,
    embeddings: { embedQuery(q: string): Promise<number[]> },
    input: SearchInput,
  ): Promise<SearchResult[]> {
    const embedding = await embeddings.embedQuery(input.query);
    const results = await search.searchByVector(embedding, input.limit ?? 5, input.project);
    return results.filter((r) => {
      if (r.score <= 0) return false;
      if (input.threshold !== undefined && r.score < input.threshold) return false;
      return true;
    });
  }

  private resolveProject(name: string): Project {
    const project = this.projectRepo.findByName(name);
    if (!project) {
      const all = this.projectRepo.list();
      const names = all.length > 0 ? all.map((p) => p.name).join(", ") : "none";
      throw new Error(`Project '${name}' not found. Available projects: ${names}`);
    }
    return project;
  }
}
```

- [ ] **Step 2: Update CLI wiring in index.ts**

In `src/cli/index.ts`:

```typescript
import { homedir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { BackendFactory } from "../core/backend.factory.js";
import { resolveConfig } from "../core/config.js";
import { DecisionService } from "../core/decision.service.js";
import { EmbeddingService } from "../core/embedding.service.js";
import { ProjectService } from "../core/project.service.js";
import { CredentialStore } from "../infra/credentials.js";
import { createDatabase } from "../infra/db.js";
import { DecisionRepo } from "../infra/decision.repo.js";
import { OllamaClient } from "../infra/ollama.client.js";
import { ProjectRepo } from "../infra/project.repo.js";
// ... existing command imports ...
import { registerLoginCommand } from "./commands/login.js";

export function createCli(): Command {
  const config = resolveConfig();
  const db = createDatabase(config.dbPath);
  const projectRepo = new ProjectRepo(db);
  const decisionRepo = new DecisionRepo(db);
  const projectService = new ProjectService(projectRepo);
  const ollamaClient = new OllamaClient(config.ollamaUrl, config.model);
  const embeddingService = new EmbeddingService(ollamaClient);
  const credentialStore = new CredentialStore(join(homedir(), ".logd", "credentials.json"));
  const backendFactory = new BackendFactory(decisionRepo, credentialStore, embeddingService);
  const decisionService = new DecisionService(projectRepo, backendFactory);

  const program = new Command();
  program.name("logd").description("Log and search decisions").version("1.0.0");

  registerProjectCommand(program, projectService);
  registerAddCommand(program, decisionService);
  registerSearchCommand(program, decisionService);
  registerShowCommand(program, decisionService);
  registerEditCommand(program, decisionService);
  registerListCommand(program, decisionService);
  registerDeleteCommand(program, decisionService);
  registerServeCommand(program, decisionService, projectService);
  registerLoginCommand(program, credentialStore);

  return program;
}
```

- [ ] **Step 3: Update decision.service.test.ts**

The test setup changes from 3-arg constructor to 2-arg. All sync service methods (`getById`, `delete`, `list`) become async. Update the full test file:

Key changes:
- Import `BackendFactory` and `CredentialStore`
- `beforeEach`: create `credentialStore`, `backendFactory`, then `service = new DecisionService(projectRepo, backendFactory)`
- `getById` tests: change `service.getById(...)` to `await service.getById(...)` and `expect(() => ...).toThrow(...)` to `await expect(service.getById(...)).rejects.toThrow(...)`
- `delete` tests: same sync→async changes
- `list` tests: same sync→async changes
- `search` tests: already async, should work

- [ ] **Step 4: Fix CLI command tests that call service methods**

Check each CLI test file. If they mock `DecisionService` methods, they should still work since the method signatures haven't changed (just sync→async for some). If any test creates a `DecisionService` directly, update the constructor.

Look at `src/cli/commands/show.test.ts`, `delete.test.ts`, `list.test.ts` — if they call `decisionService.getById()`, `delete()`, `list()` synchronously, these now return promises. The CLI commands already use `await` or `.then()` for `create`/`update`/`search` but may call `getById`/`delete`/`list` synchronously. Check and fix each CLI command file:

- `src/cli/commands/show.ts`: `decisionService.getById(id)` → needs `await`
- `src/cli/commands/delete.ts`: `decisionService.delete(id)` → needs `await`
- `src/cli/commands/list.ts`: `decisionService.list(opts)` → needs `await`

Update these command files to `await` the now-async methods. Update their action handlers to be `async`.

- [ ] **Step 5: Fix MCP server.ts**

In `src/mcp/server.ts`, the same sync→async issue:
- `logd_show_decision`: `decisionService.getById(args.id)` → `await decisionService.getById(args.id)`
- `logd_delete_decision`: `decisionService.delete(args.id)` → `await decisionService.delete(args.id)`
- `logd_list_decisions`: `decisionService.list(...)` → `await decisionService.list(...)`

These handlers are already `async` so just add `await`.

- [ ] **Step 6: Run full test suite**

Run: `npx vitest run --reporter=verbose`
Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add src/core/decision.service.ts src/core/decision.service.test.ts src/cli/index.ts src/cli/commands/show.ts src/cli/commands/delete.ts src/cli/commands/list.ts src/mcp/server.ts src/cli/commands/*.test.ts src/mcp/server.test.ts
git commit -m "refactor: DecisionService uses BackendFactory, all methods async"
```

---

### Task 9: Add login/logout/server commands

**Files:**
- Create: `src/cli/commands/login.ts`
- Create: `src/cli/commands/login.test.ts`

Note: `src/cli/index.ts` already updated in Task 8 to register these commands.

- [ ] **Step 1: Write failing tests**

Create `src/cli/commands/login.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import { CredentialStore } from "../../infra/credentials.js";
import { registerLoginCommand } from "./login.js";

vi.mock("../../infra/credentials.js");

describe("login commands", () => {
  let program: Command;
  let credentialStore: CredentialStore;
  let output: string[];

  beforeEach(() => {
    output = [];
    vi.spyOn(console, "log").mockImplementation((...args) => output.push(args.join(" ")));
    vi.spyOn(console, "error").mockImplementation((...args) => output.push(args.join(" ")));
    vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

    credentialStore = new CredentialStore("/tmp/fake");
    credentialStore.setToken = vi.fn();
    credentialStore.removeToken = vi.fn();
    credentialStore.listServers = vi.fn().mockReturnValue(["https://api.example.com"]);

    program = new Command();
    program.exitOverride(); // prevent process.exit in tests
    registerLoginCommand(program, credentialStore);
  });

  it("login stores token", () => {
    program.parse(["login", "https://api.example.com", "--token", "my-token"], { from: "user" });
    expect(credentialStore.setToken).toHaveBeenCalledWith("https://api.example.com", "my-token");
  });

  it("logout removes token", () => {
    program.parse(["logout", "https://api.example.com"], { from: "user" });
    expect(credentialStore.removeToken).toHaveBeenCalledWith("https://api.example.com");
  });

  it("server list shows servers", () => {
    program.parse(["server", "list"], { from: "user" });
    expect(output.some((line) => line.includes("https://api.example.com"))).toBe(true);
  });

  it("server list shows message when empty", () => {
    credentialStore.listServers = vi.fn().mockReturnValue([]);
    program.parse(["server", "list"], { from: "user" });
    expect(output.some((line) => line.includes("No servers configured"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/cli/commands/login.test.ts --reporter=verbose`
Expected: FAIL — module not found

- [ ] **Step 3: Implement login commands**

Create `src/cli/commands/login.ts`:

```typescript
import type { Command } from "commander";
import type { CredentialStore } from "../../infra/credentials.js";

export function registerLoginCommand(program: Command, credentialStore: CredentialStore) {
  program
    .command("login <url>")
    .description("Authenticate with a logd server")
    .requiredOption("--token <token>", "API token")
    .action((url: string, opts: { token: string }) => {
      try {
        credentialStore.setToken(url, opts.token);
        console.log(`Logged in to ${url}`);
      } catch (e) {
        console.error(`Error: ${(e as Error).message}`);
        process.exit(1);
      }
    });

  program
    .command("logout <url>")
    .description("Remove credentials for a logd server")
    .action((url: string) => {
      try {
        credentialStore.removeToken(url);
        console.log(`Logged out from ${url}`);
      } catch (e) {
        console.error(`Error: ${(e as Error).message}`);
        process.exit(1);
      }
    });

  const server = program.command("server").description("Manage server connections");

  server
    .command("list")
    .description("List authenticated servers")
    .action(() => {
      const servers = credentialStore.listServers();
      if (servers.length === 0) {
        console.log("No servers configured. Run: logd login <url> --token <token>");
        return;
      }
      for (const s of servers) {
        console.log(s);
      }
    });
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/cli/commands/login.test.ts --reporter=verbose`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/cli/commands/login.ts src/cli/commands/login.test.ts
git commit -m "feat: add logd login/logout/server list commands"
```

---

### Task 10: Add --server/--team to project create + remote validation

**Files:**
- Modify: `src/core/project.service.ts`
- Modify: `src/core/project.service.test.ts`
- Modify: `src/cli/commands/project.ts`
- Modify: `src/cli/commands/project.test.ts`

- [ ] **Step 1: Write failing tests for ProjectService**

In `src/core/project.service.test.ts`, add a new describe block:

```typescript
describe("create with server/team", () => {
  it("stores server and team", () => {
    const result = service.create("remote", "desc", "https://api.example.com", "acme");
    expect(result.server).toBe("https://api.example.com");
    expect(result.team).toBe("acme");
  });

  it("local project has null server/team", () => {
    const result = service.create("local");
    expect(result.server).toBeNull();
    expect(result.team).toBeNull();
  });

  it("throws when server without team", () => {
    expect(() => service.create("test", undefined, "https://api.example.com")).toThrow("--team is required");
  });

  it("throws when team without server", () => {
    expect(() => service.create("test", undefined, undefined, "acme")).toThrow("--server is required");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/project.service.test.ts --reporter=verbose`
Expected: FAIL — create doesn't accept server/team

- [ ] **Step 3: Update ProjectService.create**

In `src/core/project.service.ts`:

```typescript
create(name: string, description?: string, server?: string, team?: string): Project {
  const normalized = name.trim().toLowerCase();

  if (server && !team) {
    throw new Error("--team is required when --server is specified");
  }
  if (team && !server) {
    throw new Error("--server is required when --team is specified");
  }

  const existing = this.repo.findByName(normalized);
  if (existing) {
    throw new Error(`Project '${normalized}' already exists`);
  }

  const project: Project = {
    id: randomUUID(),
    name: normalized,
    description: description ?? null,
    createdAt: new Date().toISOString(),
    server: server ?? null,
    team: team ?? null,
  };

  this.repo.create(project);
  return project;
}
```

- [ ] **Step 4: Run ProjectService tests**

Run: `npx vitest run src/core/project.service.test.ts --reporter=verbose`
Expected: PASS

- [ ] **Step 5: Update project CLI command**

In `src/cli/commands/project.ts`, update the create command:

```typescript
project
  .command("create <name>")
  .description("Create a new project")
  .option("-d, --description <desc>", "Project description")
  .option("--server <url>", "Remote server URL")
  .option("--team <team>", "Team name on the remote server")
  .action((name: string, opts: { description?: string; server?: string; team?: string }) => {
    try {
      const p = projectService.create(name, opts.description, opts.server, opts.team);
      const remote = p.server ? ` (remote: ${p.server}, team: ${p.team})` : "";
      console.log(`Created project: ${p.name}${remote}`);
    } catch (e) {
      console.error(`Error: ${(e as Error).message}`);
      process.exit(1);
    }
  });
```

Update project list to show remote info:
```typescript
for (const p of projects) {
  const desc = p.description ? ` - ${p.description}` : "";
  const remote = p.server ? ` [${p.server} / ${p.team}]` : "";
  console.log(`${p.name}${desc}${remote}`);
}
```

- [ ] **Step 6: Run project CLI tests, fix if needed**

Run: `npx vitest run src/cli/commands/project.test.ts --reporter=verbose`

- [ ] **Step 7: Commit**

```bash
git add src/core/project.service.ts src/core/project.service.test.ts src/cli/commands/project.ts src/cli/commands/project.test.ts
git commit -m "feat: add --server/--team flags to project create"
```

---

### Task 11: Update MCP server with server/team on create_project

**Files:**
- Modify: `src/mcp/server.ts`
- Modify: `src/mcp/server.test.ts`

- [ ] **Step 1: Update logd_create_project tool**

In `src/mcp/server.ts`, update the schema and handler:

```typescript
server.tool(
  "logd_create_project",
  "Create a new project",
  {
    name: z.string(),
    description: z.string().optional(),
    server: z.string().optional().describe("Remote server URL"),
    team: z.string().optional().describe("Team name on the remote server"),
  },
  async (args) => {
    try {
      const project = projectService.create(args.name, args.description, args.server, args.team);
      return { content: [{ type: "text", text: JSON.stringify(project) }] };
    } catch (err) {
      return { content: [{ type: "text", text: (err as Error).message }], isError: true };
    }
  },
);
```

- [ ] **Step 2: Add MCP test for remote project creation**

In `src/mcp/server.test.ts`, add a test that verifies the MCP tool passes `server` and `team` to `projectService.create`. This depends on the existing test pattern — check how the test mocks `projectService` and add:

```typescript
it("creates remote project with server and team", async () => {
  // Call logd_create_project tool with server/team params
  // Assert projectService.create was called with (name, description, server, team)
});
```

Follow the existing test pattern in the file for invoking MCP tools.

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/mcp/server.test.ts --reporter=verbose`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/mcp/server.ts src/mcp/server.test.ts
git commit -m "feat: add server/team to logd_create_project MCP tool"
```

---

### Task 12: Lint, type-check, and final verification

**Files:** All

- [ ] **Step 1: Run linter**

Run: `npx biome check --write src/`

- [ ] **Step 2: Run type checker**

Run: `npx tsc --noEmit`
Fix any errors.

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run --reporter=verbose`
Expected: ALL PASS

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: No errors

- [ ] **Step 5: Manual smoke test**

```bash
# Local project (existing behavior)
./bin/logd.ts project create smoke-test
./bin/logd.ts project list

# Login/logout
./bin/logd.ts login https://fake.server.com --token test123
./bin/logd.ts server list
./bin/logd.ts logout https://fake.server.com

# Validation
./bin/logd.ts project create remote-test --server https://fake.com
# Should error: --team is required

./bin/logd.ts project create remote-test --team acme
# Should error: --server is required
```

- [ ] **Step 6: Commit any fixes**

```bash
git add -A
git commit -m "fix: lint and type fixes"
```
