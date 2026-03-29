# Core Server API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Hono HTTP server that fulfills the `RemoteClient` contract — CRUD decisions, search via embeddings, project creation, token auth.

**Architecture:** Hexagonal — domain/ports/application/adapters. Ports define interfaces, application layer implements use cases, adapters wire SQLite + Ollama + Hono HTTP. DI at startup in `index.ts`.

**Tech Stack:** Hono, better-sqlite3, sqlite-vec, Ollama, Vitest, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-29-core-server-api-design.md` (GitHub issue #34)

---

## File Structure

```
packages/server/src/
  index.ts                              # entry point — DI, start server
  config.ts                             # env var loading

  domain/
    decision.ts                         # build Decision from input, validate
    project.ts                          # build Project from input

  ports/
    decision.repository.ts              # DecisionRepository interface
    project.repository.ts               # ProjectRepository interface
    embedding.provider.ts               # EmbeddingProvider interface

  application/
    decision.service.ts                 # decision use cases
    decision.service.test.ts            # unit tests (mocked ports)
    project.service.ts                  # project use cases
    project.service.test.ts             # unit tests (mocked ports)

  adapters/
    persistence/
      database.ts                       # SQLite setup + migrations
      sqlite.decision.repo.ts           # DecisionRepository impl
      sqlite.decision.repo.test.ts      # integration (in-memory SQLite)
      sqlite.project.repo.ts            # ProjectRepository impl
      sqlite.project.repo.test.ts       # integration (in-memory SQLite)
    embedding/
      ollama.provider.ts                # EmbeddingProvider impl (Ollama HTTP)
    http/
      app.ts                            # Hono app factory (wires routes + middleware)
      middleware/
        auth.ts                         # Bearer token middleware
        auth.test.ts                    # unit test
      routes/
        decisions.ts                    # decision route handlers
        decisions.test.ts               # integration (app.request)
        projects.ts                     # project route handlers
        projects.test.ts                # integration (app.request)
        auth.ts                         # /auth/validate handler
        auth.test.ts                    # integration (app.request)
```

---

### Task 1: Package setup & config

**Files:**
- Modify: `packages/server/package.json`
- Modify: `packages/server/tsconfig.json`
- Create: `packages/server/src/config.ts`

- [ ] **Step 1: Update package.json with all dependencies**

```json
{
  "name": "@logd/server",
  "version": "0.0.1",
  "private": true,
  "type": "commonjs",
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "dev": "tsx watch src/index.ts"
  },
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
    "tsx": "^4",
    "typescript": "^6.0.2",
    "vitest": "^4.1.2"
  }
}
```

- [ ] **Step 2: Update tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts"]
}
```

- [ ] **Step 3: Write config.ts**

```typescript
export interface Config {
	port: number;
	apiToken: string;
	dbPath: string;
	ollamaUrl: string;
	model: string;
}

export function loadConfig(): Config {
	const apiToken = process.env.LOGD_API_TOKEN;
	if (!apiToken) {
		throw new Error("LOGD_API_TOKEN is required");
	}

	return {
		port: Number(process.env.LOGD_PORT) || 3000,
		apiToken,
		dbPath: process.env.LOGD_DB_PATH || "./logd-server.db",
		ollamaUrl: process.env.LOGD_OLLAMA_URL || "http://localhost:11434",
		model: process.env.LOGD_MODEL || "qwen3-embedding:0.6b",
	};
}
```

- [ ] **Step 4: Install dependencies**

Run: `cd /Users/tonytang/Documents/github/tonytangdev/logd && npm install`
Expected: clean install, no errors

- [ ] **Step 5: Verify typecheck**

Run: `cd /Users/tonytang/Documents/github/tonytangdev/logd && npm run typecheck -w packages/server`
Expected: no errors (only config.ts exists)

- [ ] **Step 6: Commit**

```bash
git add packages/server/package.json packages/server/tsconfig.json packages/server/src/config.ts package-lock.json
git commit -m "feat(server): package setup + config loader"
```

---

### Task 2: Port interfaces

**Files:**
- Create: `packages/server/src/ports/decision.repository.ts`
- Create: `packages/server/src/ports/project.repository.ts`
- Create: `packages/server/src/ports/embedding.provider.ts`

- [ ] **Step 1: Write DecisionRepository port**

```typescript
import type {
	Decision,
	DecisionStatus,
	SearchResult,
	UpdateDecisionInput,
} from "@logd/shared";

export interface DecisionRepository {
	create(decision: Decision, embedding: number[]): void;
	findById(id: string): Decision | null;
	update(id: string, input: UpdateDecisionInput, embedding?: number[]): void;
	delete(id: string): void;
	list(options?: {
		project?: string;
		status?: DecisionStatus;
		limit?: number;
	}): Decision[];
	searchByVector(
		embedding: number[],
		limit: number,
		project?: string,
	): SearchResult[];
}
```

- [ ] **Step 2: Write ProjectRepository port**

```typescript
export interface ProjectRepository {
	create(name: string, description: string | null): void;
	findByName(name: string): boolean;
}
```

- [ ] **Step 3: Write EmbeddingProvider port**

```typescript
export interface EmbeddingProvider {
	embed(text: string): Promise<number[]>;
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck -w packages/server`
Expected: passes

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/ports/
git commit -m "feat(server): port interfaces — decision repo, project repo, embedding"
```

---

### Task 3: Domain layer — decision & project builders

**Files:**
- Create: `packages/server/src/domain/decision.ts`
- Create: `packages/server/src/domain/project.ts`

- [ ] **Step 1: Write decision domain — build and validate**

```typescript
import { v4 as uuid } from "uuid";
import type { CreateDecisionInput, Decision, DecisionStatus } from "@logd/shared";

export function buildDecision(input: CreateDecisionInput): Decision {
	const now = new Date().toISOString();
	return {
		id: uuid(),
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
}

export function buildDocumentTemplate(decision: {
	title: string;
	context?: string | null;
	alternatives?: string[] | null;
	tags?: string[] | null;
	status?: DecisionStatus | string;
}): string {
	const lines: string[] = [`Decision: ${decision.title}`];
	if (decision.context) lines.push(`Context: ${decision.context}`);
	if (decision.alternatives?.length)
		lines.push(`Alternatives: ${decision.alternatives.join(", ")}`);
	if (decision.tags?.length)
		lines.push(`Tags: ${decision.tags.join(", ")}`);
	if (decision.status) lines.push(`Status: ${decision.status}`);
	return lines.join("\n");
}

export function buildQueryTemplate(query: string): string {
	return `Instruct: Given a question about past decisions, retrieve relevant decision records\nQuery: ${query}`;
}
```

- [ ] **Step 2: Write project domain**

```typescript
import { v4 as uuid } from "uuid";

export function buildProjectId(): string {
	return uuid();
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck -w packages/server`
Expected: passes

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/domain/
git commit -m "feat(server): domain layer — decision builder, embedding templates"
```

---

### Task 4: SQLite database setup

**Files:**
- Create: `packages/server/src/adapters/persistence/database.ts`

- [ ] **Step 1: Write database setup**

Same schema as CLI but without `server`/`team` columns on projects (those are CLI-only routing config).

```typescript
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";

export function createDatabase(dbPath: string): Database.Database {
	mkdirSync(dirname(dbPath), { recursive: true });

	const db = new Database(dbPath);
	sqliteVec.load(db);

	db.pragma("journal_mode = WAL");
	db.pragma("foreign_keys = ON");

	db.exec(`
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
	`);

	return db;
}

export function createInMemoryDatabase(): Database.Database {
	return createDatabase(":memory:");
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck -w packages/server`
Expected: passes

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/adapters/persistence/database.ts
git commit -m "feat(server): SQLite database setup with vec0"
```

---

### Task 5: SQLite project repository

**Files:**
- Create: `packages/server/src/adapters/persistence/sqlite.project.repo.ts`
- Create: `packages/server/src/adapters/persistence/sqlite.project.repo.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { createInMemoryDatabase } from "./database.js";
import { SqliteProjectRepo } from "./sqlite.project.repo.js";

describe("SqliteProjectRepo", () => {
	let repo: SqliteProjectRepo;

	beforeEach(() => {
		const db = createInMemoryDatabase();
		repo = new SqliteProjectRepo(db);
	});

	it("creates a project and findByName returns true", () => {
		repo.create("test-project", "desc");
		expect(repo.findByName("test-project")).toBe(true);
	});

	it("findByName returns false for unknown project", () => {
		expect(repo.findByName("nope")).toBe(false);
	});

	it("findByName is case-insensitive", () => {
		repo.create("MyProject", null);
		expect(repo.findByName("myproject")).toBe(true);
	});

	it("throws on duplicate project name", () => {
		repo.create("dup", null);
		expect(() => repo.create("dup", null)).toThrow();
	});
});
```

- [ ] **Step 2: Run tests — expect fail**

Run: `npm run test -w packages/server -- --reporter verbose`
Expected: FAIL — `SqliteProjectRepo` not found

- [ ] **Step 3: Implement SqliteProjectRepo**

```typescript
import type Database from "better-sqlite3";
import { v4 as uuid } from "uuid";
import type { ProjectRepository } from "../../ports/project.repository.js";

export class SqliteProjectRepo implements ProjectRepository {
	constructor(private db: Database.Database) {}

	create(name: string, description: string | null): void {
		this.db
			.prepare(
				"INSERT INTO projects (id, name, description, created_at) VALUES (?, ?, ?, ?)",
			)
			.run(uuid(), name, description, new Date().toISOString());
	}

	findByName(name: string): boolean {
		const row = this.db
			.prepare("SELECT 1 FROM projects WHERE LOWER(name) = LOWER(?)")
			.get(name.trim());
		return row !== undefined;
	}
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npm run test -w packages/server -- --reporter verbose`
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/adapters/persistence/sqlite.project.repo.ts packages/server/src/adapters/persistence/sqlite.project.repo.test.ts
git commit -m "feat(server): SQLite project repository with tests"
```

---

### Task 6: SQLite decision repository

**Files:**
- Create: `packages/server/src/adapters/persistence/sqlite.decision.repo.ts`
- Create: `packages/server/src/adapters/persistence/sqlite.decision.repo.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import type { Decision } from "@logd/shared";
import { createInMemoryDatabase } from "./database.js";
import { SqliteDecisionRepo } from "./sqlite.decision.repo.js";
import { SqliteProjectRepo } from "./sqlite.project.repo.js";

function makeDecision(overrides?: Partial<Decision>): Decision {
	return {
		id: "d-1",
		project: "proj",
		title: "Use Hono",
		context: "Need HTTP framework",
		alternatives: ["Express", "Fastify"],
		tags: ["backend"],
		status: "active",
		links: null,
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		...overrides,
	};
}

const fakeEmbedding = Array.from({ length: 1024 }, () => Math.random());

describe("SqliteDecisionRepo", () => {
	let repo: SqliteDecisionRepo;

	beforeEach(() => {
		const db = createInMemoryDatabase();
		const projectRepo = new SqliteProjectRepo(db);
		projectRepo.create("proj", null);
		repo = new SqliteDecisionRepo(db);
	});

	it("create + findById round-trips", () => {
		const d = makeDecision();
		repo.create(d, fakeEmbedding);
		const found = repo.findById("d-1");
		expect(found).not.toBeNull();
		expect(found!.title).toBe("Use Hono");
		expect(found!.alternatives).toEqual(["Express", "Fastify"]);
	});

	it("findById returns null for missing", () => {
		expect(repo.findById("nope")).toBeNull();
	});

	it("update changes fields and updatedAt", () => {
		repo.create(makeDecision(), fakeEmbedding);
		repo.update("d-1", { title: "Use Fastify" }, fakeEmbedding);
		const found = repo.findById("d-1")!;
		expect(found.title).toBe("Use Fastify");
		expect(found.updatedAt).not.toBe("2026-01-01T00:00:00.000Z");
	});

	it("delete removes from both tables", () => {
		repo.create(makeDecision(), fakeEmbedding);
		repo.delete("d-1");
		expect(repo.findById("d-1")).toBeNull();
	});

	it("list filters by project", () => {
		repo.create(makeDecision({ id: "d-1" }), fakeEmbedding);
		const results = repo.list({ project: "proj" });
		expect(results).toHaveLength(1);
		const empty = repo.list({ project: "other" });
		expect(empty).toHaveLength(0);
	});

	it("list filters by status", () => {
		repo.create(makeDecision({ id: "d-1", status: "active" }), fakeEmbedding);
		repo.create(
			makeDecision({ id: "d-2", status: "deprecated" }),
			fakeEmbedding,
		);
		const results = repo.list({ status: "active" });
		expect(results).toHaveLength(1);
		expect(results[0].id).toBe("d-1");
	});

	it("list respects limit", () => {
		repo.create(makeDecision({ id: "d-1" }), fakeEmbedding);
		repo.create(makeDecision({ id: "d-2" }), fakeEmbedding);
		const results = repo.list({ limit: 1 });
		expect(results).toHaveLength(1);
	});

	it("searchByVector returns results sorted by score", () => {
		repo.create(makeDecision({ id: "d-1" }), fakeEmbedding);
		const results = repo.searchByVector(fakeEmbedding, 10, "proj");
		expect(results.length).toBeGreaterThan(0);
		expect(results[0].decision.id).toBe("d-1");
		expect(results[0].score).toBeGreaterThan(0);
	});

	it("searchByVector filters by project", () => {
		repo.create(makeDecision({ id: "d-1" }), fakeEmbedding);
		const results = repo.searchByVector(fakeEmbedding, 10, "other");
		expect(results).toHaveLength(0);
	});
});
```

- [ ] **Step 2: Run tests — expect fail**

Run: `npm run test -w packages/server -- --reporter verbose`
Expected: FAIL — `SqliteDecisionRepo` not found

- [ ] **Step 3: Implement SqliteDecisionRepo**

Port from CLI's `packages/cli/src/infra/decision.repo.ts`. Same logic, implements server's `DecisionRepository` port.

```typescript
import type Database from "better-sqlite3";
import type {
	Decision,
	DecisionStatus,
	SearchResult,
	UpdateDecisionInput,
} from "@logd/shared";
import type { DecisionRepository } from "../../ports/decision.repository.js";

interface DecisionRow {
	id: string;
	project: string;
	title: string;
	context: string | null;
	alternatives: string | null;
	tags: string | null;
	status: string;
	links: string | null;
	created_at: string;
	updated_at: string;
}

function rowToDecision(row: DecisionRow): Decision {
	return {
		id: row.id,
		project: row.project,
		title: row.title,
		context: row.context,
		alternatives: row.alternatives ? JSON.parse(row.alternatives) : null,
		tags: row.tags ? JSON.parse(row.tags) : null,
		status: row.status as DecisionStatus,
		links: row.links ? JSON.parse(row.links) : null,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

export class SqliteDecisionRepo implements DecisionRepository {
	constructor(private db: Database.Database) {}

	create(decision: Decision, embedding: number[]): void {
		this.db
			.prepare(
				`INSERT INTO decisions (id, project, title, context, alternatives, tags, status, links, created_at, updated_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			)
			.run(
				decision.id,
				decision.project,
				decision.title,
				decision.context,
				decision.alternatives ? JSON.stringify(decision.alternatives) : null,
				decision.tags ? JSON.stringify(decision.tags) : null,
				decision.status,
				decision.links ? JSON.stringify(decision.links) : null,
				decision.createdAt,
				decision.updatedAt,
			);

		this.db
			.prepare("INSERT INTO decisions_vec (id, embedding) VALUES (?, ?)")
			.run(decision.id, new Float32Array(embedding));
	}

	findById(id: string): Decision | null {
		const row = this.db
			.prepare(
				"SELECT id, project, title, context, alternatives, tags, status, links, created_at, updated_at FROM decisions WHERE id = ?",
			)
			.get(id) as DecisionRow | undefined;
		return row ? rowToDecision(row) : null;
	}

	update(id: string, input: UpdateDecisionInput, embedding?: number[]): void {
		const setClauses: string[] = [];
		const values: unknown[] = [];

		if (input.project !== undefined) {
			setClauses.push("project = ?");
			values.push(input.project);
		}
		if (input.title !== undefined) {
			setClauses.push("title = ?");
			values.push(input.title);
		}
		if (input.context !== undefined) {
			setClauses.push("context = ?");
			values.push(input.context);
		}
		if (input.alternatives !== undefined) {
			setClauses.push("alternatives = ?");
			values.push(JSON.stringify(input.alternatives));
		}
		if (input.tags !== undefined) {
			setClauses.push("tags = ?");
			values.push(JSON.stringify(input.tags));
		}
		if (input.status !== undefined) {
			setClauses.push("status = ?");
			values.push(input.status);
		}
		if (input.links !== undefined) {
			setClauses.push("links = ?");
			values.push(JSON.stringify(input.links));
		}

		if (setClauses.length > 0) {
			setClauses.push("updated_at = ?");
			values.push(new Date().toISOString());
			this.db
				.prepare(`UPDATE decisions SET ${setClauses.join(", ")} WHERE id = ?`)
				.run(...values, id);
		}

		if (embedding) {
			this.db
				.prepare("UPDATE decisions_vec SET embedding = ? WHERE id = ?")
				.run(new Float32Array(embedding), id);
		}
	}

	delete(id: string): void {
		this.db.prepare("DELETE FROM decisions WHERE id = ?").run(id);
		this.db.prepare("DELETE FROM decisions_vec WHERE id = ?").run(id);
	}

	list(
		options: { project?: string; status?: DecisionStatus; limit?: number } = {},
	): Decision[] {
		const conditions: string[] = [];
		const values: unknown[] = [];

		if (options.project) {
			conditions.push("project = ?");
			values.push(options.project);
		}
		if (options.status) {
			conditions.push("status = ?");
			values.push(options.status);
		}

		const where =
			conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
		const limit = options.limit ?? 20;

		const rows = this.db
			.prepare(
				`SELECT id, project, title, context, alternatives, tags, status, links, created_at, updated_at
				 FROM decisions ${where} ORDER BY created_at DESC LIMIT ?`,
			)
			.all(...values, limit) as DecisionRow[];

		return rows.map(rowToDecision);
	}

	searchByVector(
		embedding: number[],
		limit: number,
		project?: string,
	): SearchResult[] {
		const rows = this.db
			.prepare(
				`SELECT v.id, v.distance
				 FROM decisions_vec v
				 WHERE embedding MATCH ?
				 ORDER BY v.distance
				 LIMIT ?`,
			)
			.all(new Float32Array(embedding), limit) as {
			id: string;
			distance: number;
		}[];

		const results: SearchResult[] = [];
		for (const row of rows) {
			const decision = this.findById(row.id);
			if (!decision) continue;
			if (project && decision.project !== project) continue;
			results.push({ decision, score: 1 - row.distance });
		}

		return results;
	}
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npm run test -w packages/server -- --reporter verbose`
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/adapters/persistence/sqlite.decision.repo.ts packages/server/src/adapters/persistence/sqlite.decision.repo.test.ts
git commit -m "feat(server): SQLite decision repository with tests"
```

---

### Task 7: Ollama embedding provider

**Files:**
- Create: `packages/server/src/adapters/embedding/ollama.provider.ts`

- [ ] **Step 1: Implement OllamaProvider**

Same pattern as CLI's `OllamaClient`. No tests — external HTTP dependency, will be integration tested through route tests with a mock.

```typescript
import type { EmbeddingProvider } from "../../ports/embedding.provider.js";

export class OllamaProvider implements EmbeddingProvider {
	constructor(
		private readonly url: string,
		private readonly model: string,
	) {}

	async embed(text: string): Promise<number[]> {
		let response: Response;
		try {
			response = await fetch(`${this.url}/api/embed`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ model: this.model, input: text }),
			});
		} catch {
			throw new Error(
				`Cannot connect to Ollama at ${this.url}. Is it running?`,
			);
		}

		if (!response.ok) {
			throw new Error(
				`Ollama error: ${response.status} ${response.statusText}`,
			);
		}

		const data = await response.json();
		return data.embeddings[0];
	}
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck -w packages/server`
Expected: passes

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/adapters/embedding/ollama.provider.ts
git commit -m "feat(server): Ollama embedding provider"
```

---

### Task 8: Application layer — project service

**Files:**
- Create: `packages/server/src/application/project.service.ts`
- Create: `packages/server/src/application/project.service.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import type { ProjectRepository } from "../ports/project.repository.js";
import { ProjectService } from "./project.service.js";

function mockProjectRepo(): ProjectRepository & { names: Set<string> } {
	const names = new Set<string>();
	return {
		names,
		create(name: string, description: string | null) {
			names.add(name.toLowerCase());
		},
		findByName(name: string) {
			return names.has(name.toLowerCase());
		},
	};
}

describe("ProjectService", () => {
	let service: ProjectService;
	let repo: ReturnType<typeof mockProjectRepo>;

	beforeEach(() => {
		repo = mockProjectRepo();
		service = new ProjectService(repo);
	});

	it("creates a project", () => {
		service.create("my-proj", "desc");
		expect(repo.names.has("my-proj")).toBe(true);
	});

	it("throws 409 on duplicate", () => {
		service.create("dup", null);
		expect(() => service.create("dup", null)).toThrow("already exists");
	});
});
```

- [ ] **Step 2: Run tests — expect fail**

Run: `npm run test -w packages/server -- --reporter verbose`
Expected: FAIL — `ProjectService` not found

- [ ] **Step 3: Implement ProjectService**

```typescript
import type { ProjectRepository } from "../ports/project.repository.js";

export class ProjectService {
	constructor(private repo: ProjectRepository) {}

	create(name: string, description: string | null): void {
		if (this.repo.findByName(name)) {
			throw new ConflictError(`Project '${name}' already exists`);
		}
		this.repo.create(name, description);
	}
}

export class ConflictError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ConflictError";
	}
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npm run test -w packages/server -- --reporter verbose`
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/application/project.service.ts packages/server/src/application/project.service.test.ts
git commit -m "feat(server): project service with conflict detection"
```

---

### Task 9: Application layer — decision service

**Files:**
- Create: `packages/server/src/application/decision.service.ts`
- Create: `packages/server/src/application/decision.service.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Decision, SearchResult, UpdateDecisionInput, DecisionStatus } from "@logd/shared";
import type { DecisionRepository } from "../ports/decision.repository.js";
import type { EmbeddingProvider } from "../ports/embedding.provider.js";
import { DecisionService } from "./decision.service.js";

const fakeEmbedding = [0.1, 0.2, 0.3];

function mockDecisionRepo(): DecisionRepository {
	const store = new Map<string, Decision>();
	return {
		create: vi.fn((d: Decision) => { store.set(d.id, d); }),
		findById: vi.fn((id: string) => store.get(id) ?? null),
		update: vi.fn(),
		delete: vi.fn((id: string) => { store.delete(id); }),
		list: vi.fn(() => [...store.values()]),
		searchByVector: vi.fn(() => []),
	};
}

function mockEmbedding(): EmbeddingProvider {
	return { embed: vi.fn(async () => fakeEmbedding) };
}

describe("DecisionService", () => {
	let service: DecisionService;
	let repo: ReturnType<typeof mockDecisionRepo>;
	let embedding: ReturnType<typeof mockEmbedding>;

	beforeEach(() => {
		repo = mockDecisionRepo();
		embedding = mockEmbedding();
		service = new DecisionService(repo, embedding);
	});

	it("create builds decision, embeds, stores, returns", async () => {
		const result = await service.create({ project: "proj", title: "Use Hono" });
		expect(result.title).toBe("Use Hono");
		expect(result.id).toBeDefined();
		expect(repo.create).toHaveBeenCalled();
		expect(embedding.embed).toHaveBeenCalled();
	});

	it("get returns decision by id", async () => {
		const created = await service.create({ project: "proj", title: "Test" });
		const found = service.get(created.id);
		expect(found).not.toBeNull();
	});

	it("get returns null for missing", () => {
		expect(service.get("nope")).toBeNull();
	});

	it("update calls repo.update with new embedding", async () => {
		const created = await service.create({ project: "proj", title: "Test" });
		await service.update(created.id, { title: "Updated" });
		expect(repo.update).toHaveBeenCalled();
		expect(embedding.embed).toHaveBeenCalledTimes(2); // create + update
	});

	it("update throws NotFoundError for missing decision", async () => {
		await expect(service.update("nope", { title: "X" })).rejects.toThrow("not found");
	});

	it("delete calls repo.delete", () => {
		service.delete("d-1");
		expect(repo.delete).toHaveBeenCalledWith("d-1");
	});

	it("list delegates to repo", () => {
		service.list({ project: "proj" });
		expect(repo.list).toHaveBeenCalledWith({ project: "proj" });
	});

	it("search embeds query then calls searchByVector, filters by threshold", async () => {
		const mockResults: SearchResult[] = [
			{ decision: { id: "d-1", project: "proj", title: "T", context: null, alternatives: null, tags: null, status: "active", links: null, createdAt: "", updatedAt: "" }, score: 0.9 },
			{ decision: { id: "d-2", project: "proj", title: "T2", context: null, alternatives: null, tags: null, status: "active", links: null, createdAt: "", updatedAt: "" }, score: 0.3 },
		];
		(repo.searchByVector as ReturnType<typeof vi.fn>).mockReturnValue(mockResults);

		const results = await service.search("proj", "query", 0.5, 10);
		expect(results).toHaveLength(1);
		expect(results[0].score).toBe(0.9);
		expect(embedding.embed).toHaveBeenCalled();
	});
});
```

- [ ] **Step 2: Run tests — expect fail**

Run: `npm run test -w packages/server -- --reporter verbose`
Expected: FAIL — `DecisionService` not found

- [ ] **Step 3: Implement DecisionService**

```typescript
import type {
	CreateDecisionInput,
	Decision,
	DecisionStatus,
	SearchResult,
	UpdateDecisionInput,
} from "@logd/shared";
import {
	buildDecision,
	buildDocumentTemplate,
	buildQueryTemplate,
} from "../domain/decision.js";
import type { DecisionRepository } from "../ports/decision.repository.js";
import type { EmbeddingProvider } from "../ports/embedding.provider.js";

export class DecisionService {
	constructor(
		private repo: DecisionRepository,
		private embedding: EmbeddingProvider,
	) {}

	async create(input: CreateDecisionInput): Promise<Decision> {
		const decision = buildDecision(input);
		const vector = await this.embedding.embed(buildDocumentTemplate(decision));
		this.repo.create(decision, vector);
		return decision;
	}

	get(id: string): Decision | null {
		return this.repo.findById(id);
	}

	async update(id: string, input: UpdateDecisionInput): Promise<void> {
		const existing = this.repo.findById(id);
		if (!existing) throw new NotFoundError(`Decision '${id}' not found`);

		const merged = { ...existing, ...input };
		const vector = await this.embedding.embed(buildDocumentTemplate(merged));
		this.repo.update(id, input, vector);
	}

	delete(id: string): void {
		this.repo.delete(id);
	}

	list(options?: {
		project?: string;
		status?: DecisionStatus;
		limit?: number;
	}): Decision[] {
		return this.repo.list(options);
	}

	async search(
		project: string,
		query: string,
		threshold: number,
		limit: number,
	): Promise<SearchResult[]> {
		const vector = await this.embedding.embed(buildQueryTemplate(query));
		const results = this.repo.searchByVector(vector, limit, project);
		return results.filter((r) => r.score >= threshold);
	}
}

export class NotFoundError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "NotFoundError";
	}
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npm run test -w packages/server -- --reporter verbose`
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/application/decision.service.ts packages/server/src/application/decision.service.test.ts
git commit -m "feat(server): decision service — CRUD, search, embedding"
```

---

### Task 10: Auth middleware

**Files:**
- Create: `packages/server/src/adapters/http/middleware/auth.ts`
- Create: `packages/server/src/adapters/http/middleware/auth.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { authMiddleware } from "./auth.js";

function makeApp(token: string) {
	const app = new Hono();
	app.use("*", authMiddleware(token));
	app.get("/test", (c) => c.text("ok"));
	return app;
}

describe("authMiddleware", () => {
	it("returns 401 when no Authorization header", async () => {
		const app = makeApp("secret");
		const res = await app.request("/test");
		expect(res.status).toBe(401);
		const body = await res.text();
		expect(body).toContain("Authentication failed");
	});

	it("returns 401 when token is wrong", async () => {
		const app = makeApp("secret");
		const res = await app.request("/test", {
			headers: { Authorization: "Bearer wrong" },
		});
		expect(res.status).toBe(401);
	});

	it("passes with correct token", async () => {
		const app = makeApp("secret");
		const res = await app.request("/test", {
			headers: { Authorization: "Bearer secret" },
		});
		expect(res.status).toBe(200);
		expect(await res.text()).toBe("ok");
	});

	it("accepts X-Team header without error", async () => {
		const app = makeApp("secret");
		const res = await app.request("/test", {
			headers: {
				Authorization: "Bearer secret",
				"X-Team": "my-team",
			},
		});
		expect(res.status).toBe(200);
	});
});
```

- [ ] **Step 2: Run tests — expect fail**

Run: `npm run test -w packages/server -- --reporter verbose`
Expected: FAIL — `authMiddleware` not found

- [ ] **Step 3: Implement auth middleware**

```typescript
import type { MiddlewareHandler } from "hono";

export function authMiddleware(apiToken: string): MiddlewareHandler {
	return async (c, next) => {
		const authHeader = c.req.header("Authorization");
		if (!authHeader?.startsWith("Bearer ")) {
			return c.text("Authentication failed: token expired or invalid.", 401);
		}

		const token = authHeader.slice(7);
		if (token !== apiToken) {
			return c.text("Authentication failed: token expired or invalid.", 401);
		}

		await next();
	};
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npm run test -w packages/server -- --reporter verbose`
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/adapters/http/middleware/auth.ts packages/server/src/adapters/http/middleware/auth.test.ts
git commit -m "feat(server): Bearer token auth middleware"
```

---

### Task 11: HTTP routes — auth validate

**Files:**
- Create: `packages/server/src/adapters/http/routes/auth.ts`
- Create: `packages/server/src/adapters/http/routes/auth.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth.js";
import { authRoutes } from "./auth.js";

function makeApp() {
	const app = new Hono();
	app.use("*", authMiddleware("test-token"));
	app.route("/auth", authRoutes());
	return app;
}

describe("GET /auth/validate", () => {
	it("returns 200 with valid token", async () => {
		const app = makeApp();
		const res = await app.request("/auth/validate", {
			headers: { Authorization: "Bearer test-token" },
		});
		expect(res.status).toBe(200);
	});

	it("returns 401 without token", async () => {
		const app = makeApp();
		const res = await app.request("/auth/validate");
		expect(res.status).toBe(401);
	});
});
```

- [ ] **Step 2: Run tests — expect fail**

Run: `npm run test -w packages/server -- --reporter verbose`
Expected: FAIL

- [ ] **Step 3: Implement auth routes**

```typescript
import { Hono } from "hono";

export function authRoutes(): Hono {
	const router = new Hono();
	router.get("/validate", (c) => c.body(null, 200));
	return router;
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npm run test -w packages/server -- --reporter verbose`
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/adapters/http/routes/auth.ts packages/server/src/adapters/http/routes/auth.test.ts
git commit -m "feat(server): /auth/validate route"
```

---

### Task 12: HTTP routes — projects

**Files:**
- Create: `packages/server/src/adapters/http/routes/projects.ts`
- Create: `packages/server/src/adapters/http/routes/projects.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth.js";
import { createInMemoryDatabase } from "../../persistence/database.js";
import { SqliteProjectRepo } from "../../persistence/sqlite.project.repo.js";
import { ProjectService } from "../../../application/project.service.js";
import { projectRoutes } from "./projects.js";

const TOKEN = "test-token";
const headers = {
	Authorization: `Bearer ${TOKEN}`,
	"Content-Type": "application/json",
};

function makeApp() {
	const db = createInMemoryDatabase();
	const repo = new SqliteProjectRepo(db);
	const service = new ProjectService(repo);
	const app = new Hono();
	app.use("*", authMiddleware(TOKEN));
	app.route("/projects", projectRoutes(service));
	return app;
}

describe("POST /projects", () => {
	it("creates project — 201", async () => {
		const app = makeApp();
		const res = await app.request("/projects", {
			method: "POST",
			headers,
			body: JSON.stringify({ name: "my-proj", description: "desc" }),
		});
		expect(res.status).toBe(201);
	});

	it("returns 400 when name missing", async () => {
		const app = makeApp();
		const res = await app.request("/projects", {
			method: "POST",
			headers,
			body: JSON.stringify({}),
		});
		expect(res.status).toBe(400);
		expect(await res.text()).toContain("name is required");
	});

	it("returns 409 on duplicate", async () => {
		const app = makeApp();
		await app.request("/projects", {
			method: "POST",
			headers,
			body: JSON.stringify({ name: "dup" }),
		});
		const res = await app.request("/projects", {
			method: "POST",
			headers,
			body: JSON.stringify({ name: "dup" }),
		});
		expect(res.status).toBe(409);
		expect(await res.text()).toContain("already exists");
	});
});
```

- [ ] **Step 2: Run tests — expect fail**

Run: `npm run test -w packages/server -- --reporter verbose`
Expected: FAIL

- [ ] **Step 3: Implement project routes**

```typescript
import { Hono } from "hono";
import type { ProjectService } from "../../../application/project.service.js";
import { ConflictError } from "../../../application/project.service.js";

export function projectRoutes(service: ProjectService): Hono {
	const router = new Hono();

	router.post("/", async (c) => {
		const body = await c.req.json();
		if (!body.name) {
			return c.text("name is required", 400);
		}

		try {
			service.create(body.name, body.description ?? null);
			return c.body(null, 201);
		} catch (e) {
			if (e instanceof ConflictError) {
				return c.text(e.message, 409);
			}
			throw e;
		}
	});

	return router;
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npm run test -w packages/server -- --reporter verbose`
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/adapters/http/routes/projects.ts packages/server/src/adapters/http/routes/projects.test.ts
git commit -m "feat(server): POST /projects route"
```

---

### Task 13: HTTP routes — decisions

**Files:**
- Create: `packages/server/src/adapters/http/routes/decisions.ts`
- Create: `packages/server/src/adapters/http/routes/decisions.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth.js";
import { createInMemoryDatabase } from "../../persistence/database.js";
import { SqliteProjectRepo } from "../../persistence/sqlite.project.repo.js";
import { SqliteDecisionRepo } from "../../persistence/sqlite.decision.repo.js";
import { ProjectService } from "../../../application/project.service.js";
import { DecisionService } from "../../../application/decision.service.js";
import type { EmbeddingProvider } from "../../../ports/embedding.provider.js";
import { decisionRoutes } from "./decisions.js";

const TOKEN = "test-token";
const headers = {
	Authorization: `Bearer ${TOKEN}`,
	"Content-Type": "application/json",
};

const fakeEmbedding = Array.from({ length: 1024 }, () => 0.1);
const mockEmbedding: EmbeddingProvider = {
	embed: vi.fn(async () => fakeEmbedding),
};

function makeApp() {
	const db = createInMemoryDatabase();
	const projectRepo = new SqliteProjectRepo(db);
	const decisionRepo = new SqliteDecisionRepo(db);
	const projectService = new ProjectService(projectRepo);
	const decisionService = new DecisionService(decisionRepo, mockEmbedding);

	// Seed a project
	projectService.create("proj", null);

	const app = new Hono();
	app.use("*", authMiddleware(TOKEN));
	app.route("/decisions", decisionRoutes(decisionService));
	return app;
}

describe("decision routes", () => {
	describe("POST /decisions", () => {
		it("creates decision — 201 with body", async () => {
			const app = makeApp();
			const res = await app.request("/decisions", {
				method: "POST",
				headers,
				body: JSON.stringify({ project: "proj", title: "Use Hono" }),
			});
			expect(res.status).toBe(201);
			const body = await res.json();
			expect(body.title).toBe("Use Hono");
			expect(body.id).toBeDefined();
		});

		it("returns 400 when title missing", async () => {
			const app = makeApp();
			const res = await app.request("/decisions", {
				method: "POST",
				headers,
				body: JSON.stringify({ project: "proj" }),
			});
			expect(res.status).toBe(400);
			expect(await res.text()).toContain("title is required");
		});

		it("returns 400 when project missing", async () => {
			const app = makeApp();
			const res = await app.request("/decisions", {
				method: "POST",
				headers,
				body: JSON.stringify({ title: "Test" }),
			});
			expect(res.status).toBe(400);
			expect(await res.text()).toContain("project is required");
		});
	});

	describe("GET /decisions/:id", () => {
		it("returns decision", async () => {
			const app = makeApp();
			const createRes = await app.request("/decisions", {
				method: "POST",
				headers,
				body: JSON.stringify({ project: "proj", title: "T" }),
			});
			const { id } = await createRes.json();

			const res = await app.request(`/decisions/${id}`, { headers });
			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.id).toBe(id);
		});

		it("returns 404 for missing", async () => {
			const app = makeApp();
			const res = await app.request("/decisions/nope", { headers });
			expect(res.status).toBe(404);
			expect(await res.text()).toContain("not found");
		});
	});

	describe("PATCH /decisions/:id", () => {
		it("updates decision — 204", async () => {
			const app = makeApp();
			const createRes = await app.request("/decisions", {
				method: "POST",
				headers,
				body: JSON.stringify({ project: "proj", title: "T" }),
			});
			const { id } = await createRes.json();

			const res = await app.request(`/decisions/${id}`, {
				method: "PATCH",
				headers,
				body: JSON.stringify({ title: "Updated" }),
			});
			expect(res.status).toBe(204);
		});

		it("returns 404 for missing", async () => {
			const app = makeApp();
			const res = await app.request("/decisions/nope", {
				method: "PATCH",
				headers,
				body: JSON.stringify({ title: "X" }),
			});
			expect(res.status).toBe(404);
		});
	});

	describe("DELETE /decisions/:id", () => {
		it("deletes decision — 204", async () => {
			const app = makeApp();
			const createRes = await app.request("/decisions", {
				method: "POST",
				headers,
				body: JSON.stringify({ project: "proj", title: "T" }),
			});
			const { id } = await createRes.json();

			const res = await app.request(`/decisions/${id}`, {
				method: "DELETE",
				headers,
			});
			expect(res.status).toBe(204);

			// Verify deleted
			const getRes = await app.request(`/decisions/${id}`, { headers });
			expect(getRes.status).toBe(404);
		});
	});

	describe("GET /decisions?project=&status=&limit=", () => {
		it("lists decisions filtered by project", async () => {
			const app = makeApp();
			await app.request("/decisions", {
				method: "POST",
				headers,
				body: JSON.stringify({ project: "proj", title: "T1" }),
			});

			const res = await app.request("/decisions?project=proj", { headers });
			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body).toHaveLength(1);
		});
	});

	describe("POST /decisions/search", () => {
		it("searches decisions", async () => {
			const app = makeApp();
			await app.request("/decisions", {
				method: "POST",
				headers,
				body: JSON.stringify({ project: "proj", title: "Use Hono for HTTP" }),
			});

			const res = await app.request("/decisions/search", {
				method: "POST",
				headers,
				body: JSON.stringify({
					project: "proj",
					query: "HTTP framework",
					threshold: 0,
					limit: 10,
				}),
			});
			expect(res.status).toBe(200);
			const body = await res.json();
			expect(Array.isArray(body)).toBe(true);
		});

		it("returns 400 when project missing", async () => {
			const app = makeApp();
			const res = await app.request("/decisions/search", {
				method: "POST",
				headers,
				body: JSON.stringify({ query: "test" }),
			});
			expect(res.status).toBe(400);
			expect(await res.text()).toContain("project is required");
		});

		it("returns 400 when query missing", async () => {
			const app = makeApp();
			const res = await app.request("/decisions/search", {
				method: "POST",
				headers,
				body: JSON.stringify({ project: "proj" }),
			});
			expect(res.status).toBe(400);
			expect(await res.text()).toContain("query is required");
		});
	});
});
```

- [ ] **Step 2: Run tests — expect fail**

Run: `npm run test -w packages/server -- --reporter verbose`
Expected: FAIL

- [ ] **Step 3: Implement decision routes**

```typescript
import { Hono } from "hono";
import type { DecisionService } from "../../../application/decision.service.js";
import { NotFoundError } from "../../../application/decision.service.js";

export function decisionRoutes(service: DecisionService): Hono {
	const router = new Hono();

	router.post("/search", async (c) => {
		const body = await c.req.json();
		if (!body.project) return c.text("project is required", 400);
		if (!body.query) return c.text("query is required", 400);

		const results = await service.search(
			body.project,
			body.query,
			body.threshold ?? 0,
			body.limit ?? 20,
		);
		return c.json(results, 200);
	});

	router.post("/", async (c) => {
		const body = await c.req.json();
		if (!body.project) return c.text("project is required", 400);
		if (!body.title) return c.text("title is required", 400);

		const decision = await service.create(body);
		return c.json(decision, 201);
	});

	router.get("/:id", (c) => {
		const decision = service.get(c.req.param("id"));
		if (!decision) {
			return c.text(`Decision '${c.req.param("id")}' not found`, 404);
		}
		return c.json(decision, 200);
	});

	router.patch("/:id", async (c) => {
		const body = await c.req.json();
		try {
			await service.update(c.req.param("id"), body);
			return c.body(null, 204);
		} catch (e) {
			if (e instanceof NotFoundError) {
				return c.text(e.message, 404);
			}
			throw e;
		}
	});

	router.delete("/:id", (c) => {
		service.delete(c.req.param("id"));
		return c.body(null, 204);
	});

	router.get("/", (c) => {
		const project = c.req.query("project");
		const status = c.req.query("status");
		const limit = c.req.query("limit");

		const decisions = service.list({
			project: project || undefined,
			status: (status as "active" | "superseded" | "deprecated") || undefined,
			limit: limit ? Number(limit) : undefined,
		});
		return c.json(decisions, 200);
	});

	return router;
}
```

**Important:** `POST /search` must be registered before `GET /:id` and `POST /` so Hono doesn't match `/search` as an `:id` param.

- [ ] **Step 4: Run tests — expect pass**

Run: `npm run test -w packages/server -- --reporter verbose`
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/adapters/http/routes/decisions.ts packages/server/src/adapters/http/routes/decisions.test.ts
git commit -m "feat(server): decision routes — CRUD, list, search"
```

---

### Task 14: Hono app factory + entry point

**Files:**
- Create: `packages/server/src/adapters/http/app.ts`
- Create: `packages/server/src/index.ts`

- [ ] **Step 1: Write app factory**

```typescript
import { Hono } from "hono";
import type { DecisionService } from "../../application/decision.service.js";
import type { ProjectService } from "../../application/project.service.js";
import { authMiddleware } from "./middleware/auth.js";
import { authRoutes } from "./routes/auth.js";
import { decisionRoutes } from "./routes/decisions.js";
import { projectRoutes } from "./routes/projects.js";

export interface AppDeps {
	apiToken: string;
	decisionService: DecisionService;
	projectService: ProjectService;
}

export function createApp(deps: AppDeps): Hono {
	const app = new Hono();
	app.use("*", authMiddleware(deps.apiToken));
	app.route("/auth", authRoutes());
	app.route("/decisions", decisionRoutes(deps.decisionService));
	app.route("/projects", projectRoutes(deps.projectService));
	return app;
}
```

- [ ] **Step 2: Write entry point (index.ts)**

```typescript
import { serve } from "@hono/node-server";
import { DecisionService } from "./application/decision.service.js";
import { ProjectService } from "./application/project.service.js";
import { OllamaProvider } from "./adapters/embedding/ollama.provider.js";
import { createApp } from "./adapters/http/app.js";
import { createDatabase } from "./adapters/persistence/database.js";
import { SqliteDecisionRepo } from "./adapters/persistence/sqlite.decision.repo.js";
import { SqliteProjectRepo } from "./adapters/persistence/sqlite.project.repo.js";
import { loadConfig } from "./config.js";

const config = loadConfig();

const db = createDatabase(config.dbPath);
const embeddingProvider = new OllamaProvider(config.ollamaUrl, config.model);

const decisionRepo = new SqliteDecisionRepo(db);
const projectRepo = new SqliteProjectRepo(db);

const decisionService = new DecisionService(decisionRepo, embeddingProvider);
const projectService = new ProjectService(projectRepo);

const app = createApp({
	apiToken: config.apiToken,
	decisionService,
	projectService,
});

serve({ fetch: app.fetch, port: config.port }, (info) => {
	console.log(`logd server listening on http://localhost:${info.port}`);
});
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck -w packages/server`
Expected: passes

- [ ] **Step 4: Build**

Run: `npm run build -w packages/server`
Expected: clean build, dist/ created

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/adapters/http/app.ts packages/server/src/index.ts
git commit -m "feat(server): app factory + entry point with DI wiring"
```

---

### Task 15: Lint, format, final checks

**Files:**
- Modify: any files flagged by linter

- [ ] **Step 1: Format**

Run: `cd /Users/tonytang/Documents/github/tonytangdev/logd && npx biome format --write packages/server/`
Expected: files formatted

- [ ] **Step 2: Lint**

Run: `npx biome check packages/server/`
Expected: no errors (fix any that appear)

- [ ] **Step 3: Run all server tests**

Run: `npm run test -w packages/server -- --reporter verbose`
Expected: all pass

- [ ] **Step 4: Run full monorepo build + test**

Run: `npm run build && npm run test`
Expected: all packages build and test clean

- [ ] **Step 5: Commit any lint fixes**

```bash
git add -A packages/server/
git commit -m "chore(server): lint + format fixes"
```

- [ ] **Step 6: Close issue #34**

Run: `gh issue close 34 --comment "Phase 2a: core server API implemented"`
