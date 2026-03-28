# logd Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a CLI tool and MCP server for logging and semantically searching decisions using Ollama embeddings and SQLite.

**Architecture:** Layered monolith — `core/` (business logic with DI), `infra/` (SQLite + Ollama), `cli/` (Commander.js), `mcp/` (MCP server). Core services receive repos and clients as constructor params for testability.

**Tech Stack:** TypeScript, Commander.js, better-sqlite3, sqlite-vec, Ollama (Qwen3-Embedding-0.6B), @modelcontextprotocol/sdk, vitest

**Spec:** `docs/superpowers/specs/2026-03-28-logd-design.md`

---

## File Map

| File | Responsibility |
|---|---|
| `src/core/types.ts` | All shared types and interfaces (Decision, Project, repos, clients) |
| `src/core/config.ts` | Configuration resolution (defaults → env → CLI flags). Not in original spec file map but needed for config precedence. |
| `src/core/embedding.service.ts` | Build embedding templates, call embedder, return vectors |
| `src/core/decision.service.ts` | Business logic: CRUD, search orchestration, validation |
| `src/core/project.service.ts` | Project CRUD with name normalization. Not in original spec file map but cleanly separates project logic. |
| `src/infra/db.ts` | SQLite + sqlite-vec setup, migrations, connection factory |
| `src/infra/ollama.client.ts` | Ollama `/api/embed` HTTP wrapper |
| `src/infra/decision.repo.ts` | Decision DB queries (CRUD + vector search) |
| `src/infra/project.repo.ts` | Project DB queries |
| `src/cli/index.ts` | CLI entrypoint, wires Commander commands |
| `src/cli/commands/add.ts` | `logd add` command handler |
| `src/cli/commands/search.ts` | `logd search` command handler |
| `src/cli/commands/show.ts` | `logd show` command handler |
| `src/cli/commands/edit.ts` | `logd edit` command handler |
| `src/cli/commands/delete.ts` | `logd delete` command handler |
| `src/cli/commands/list.ts` | `logd list` command handler |
| `src/cli/commands/project.ts` | `logd project create/list` command handler |
| `src/cli/commands/serve.ts` | `logd serve` command handler |
| `src/mcp/server.ts` | MCP server, maps tools to core services |
| `bin/logd.ts` | Shebang entrypoint |

---

## Task 1: Project scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`

- [ ] **Step 1: Initialize project**

```bash
npm init -y
```

- [ ] **Step 2: Install dependencies**

```bash
npm install commander better-sqlite3 sqlite-vec @modelcontextprotocol/sdk uuid
npm install -D typescript @types/better-sqlite3 @types/uuid vitest
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": ".",
    "strict": true,
    "esModuleInterop": true,
    "declaration": true,
    "sourceMap": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*", "bin/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 4: Create vitest.config.ts**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
  },
});
```

- [ ] **Step 5: Create .gitignore**

```
node_modules/
dist/
*.db
```

- [ ] **Step 6: Create src directory structure**

```bash
mkdir -p src/core src/infra src/cli/commands src/mcp bin
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "scaffold project with deps and config"
```

---

## Task 2: Core types

**Files:**
- Create: `src/core/types.ts`
- Test: `src/core/types.test.ts`

- [ ] **Step 1: Write failing test for types** — verify Decision and Project types exist with correct shapes, status enum values are constrained.

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/core/types.test.ts
```

- [ ] **Step 3: Implement types**

```ts
// src/core/types.ts

export const DECISION_STATUSES = ["active", "superseded", "deprecated"] as const;
export type DecisionStatus = (typeof DECISION_STATUSES)[number];

export interface Decision {
  id: string;
  project: string;
  title: string;
  context: string | null;
  alternatives: string[] | null;
  tags: string[] | null;
  status: DecisionStatus;
  links: string[] | null;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
}

export interface CreateDecisionInput {
  project: string;
  title: string;
  context?: string;
  alternatives?: string[];
  tags?: string[];
  status?: DecisionStatus;
  links?: string[];
}

export interface UpdateDecisionInput {
  project?: string;
  title?: string;
  context?: string;
  alternatives?: string[];
  tags?: string[];
  status?: DecisionStatus;
  links?: string[];
}

export interface SearchInput {
  query: string;
  project?: string;
  limit?: number;
  threshold?: number;
}

export interface SearchResult {
  decision: Decision;
  score: number;
}

export interface IProjectRepo {
  create(project: Project): void;
  findByName(name: string): Project | null;
  list(): Project[];
}

export interface IDecisionRepo {
  create(decision: Decision, embedding: number[]): void;
  findById(id: string): Decision | null;
  update(id: string, fields: UpdateDecisionInput, embedding?: number[]): void;
  delete(id: string): void;
  list(filters: { project?: string; status?: DecisionStatus; limit: number }): Decision[];
  searchByVector(embedding: number[], limit: number, project?: string): SearchResult[];
}

export interface IEmbeddingClient {
  embed(text: string): Promise<number[]>;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/core/types.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/core/types.ts src/core/types.test.ts
git commit -m "add core types, interfaces, and repo contracts"
```

---

## Task 3: Configuration

**Files:**
- Create: `src/core/config.ts`
- Test: `src/core/config.test.ts`

- [ ] **Step 1: Write failing tests** — default values, env var override, CLI flag override, precedence order.

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/core/config.test.ts
```

- [ ] **Step 3: Implement config resolution**

```ts
// src/core/config.ts

export interface Config {
  ollamaUrl: string;
  model: string;
  dbPath: string;
}

export interface ConfigOverrides {
  ollamaUrl?: string;
  model?: string;
  dbPath?: string;
}

export function resolveConfig(overrides: ConfigOverrides = {}): Config {
  return {
    ollamaUrl: overrides.ollamaUrl ?? process.env.LOGD_OLLAMA_URL ?? "http://localhost:11434",
    model: overrides.model ?? process.env.LOGD_MODEL ?? "qwen3-embedding:0.6b",
    dbPath: overrides.dbPath ?? process.env.LOGD_DB_PATH ?? `${process.env.HOME}/.logd/logd.db`,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/core/config.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/core/config.ts src/core/config.test.ts
git commit -m "add config resolution with defaults/env/flag precedence"
```

---

## Task 4: Embedding service

**Files:**
- Create: `src/core/embedding.service.ts`
- Test: `src/core/embedding.service.test.ts`

- [ ] **Step 1: Write failing tests** — document template with all fields, template with only title, template with partial fields, query template with instruction prefix, embed calls client.

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/core/embedding.service.test.ts
```

- [ ] **Step 3: Implement embedding service**

```ts
// src/core/embedding.service.ts

import { CreateDecisionInput, IEmbeddingClient } from "./types.js";

const SEARCH_INSTRUCTION = "Given a question about past decisions, retrieve relevant decision records";

export function buildDocumentTemplate(input: {
  title: string;
  context?: string | null;
  alternatives?: string[] | null;
  tags?: string[] | null;
  status?: string;
}): string {
  const parts: string[] = [`Decision: ${input.title}`];
  if (input.context) parts.push(`Context: ${input.context}`);
  if (input.alternatives?.length) parts.push(`Alternatives: ${input.alternatives.join(", ")}`);
  if (input.tags?.length) parts.push(`Tags: ${input.tags.join(", ")}`);
  if (input.status) parts.push(`Status: ${input.status}`);
  return parts.join("\n");
}

export function buildQueryTemplate(query: string): string {
  return `Instruct: ${SEARCH_INSTRUCTION}\nQuery: ${query}`;
}

export class EmbeddingService {
  constructor(private client: IEmbeddingClient) {}

  async embedDecision(input: {
    title: string;
    context?: string | null;
    alternatives?: string[] | null;
    tags?: string[] | null;
    status?: string;
  }): Promise<number[]> {
    const text = buildDocumentTemplate(input);
    return this.client.embed(text);
  }

  async embedQuery(query: string): Promise<number[]> {
    const text = buildQueryTemplate(query);
    return this.client.embed(text);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/core/embedding.service.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/core/embedding.service.ts src/core/embedding.service.test.ts
git commit -m "add embedding service with Qwen3 document/query templates"
```

---

## Task 5: Ollama client

**Files:**
- Create: `src/infra/ollama.client.ts`
- Test: `src/infra/ollama.client.test.ts`

- [ ] **Step 1: Write failing tests** — successful embed call (mock fetch), connection error handling, response parsing.

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/infra/ollama.client.test.ts
```

- [ ] **Step 3: Implement Ollama client**

```ts
// src/infra/ollama.client.ts

import { IEmbeddingClient } from "../core/types.js";

export class OllamaClient implements IEmbeddingClient {
  constructor(
    private url: string,
    private model: string
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
      throw new Error(`Cannot connect to Ollama at ${this.url}. Is it running?`);
    }

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.embeddings[0];
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/infra/ollama.client.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/infra/ollama.client.ts src/infra/ollama.client.test.ts
git commit -m "add Ollama client with embed endpoint and error handling"
```

---

## Task 6: Database setup and migrations

**Files:**
- Create: `src/infra/db.ts`
- Test: `src/infra/db.test.ts`

- [ ] **Step 1: Write failing tests** — creates DB file and parent dirs, creates projects table, creates decisions table, creates decisions_vec virtual table, migrations are idempotent.

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/infra/db.test.ts
```

- [ ] **Step 3: Implement database setup**

```ts
// src/infra/db.ts

import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { mkdirSync } from "fs";
import { dirname } from "path";

export function createDatabase(dbPath: string): Database.Database {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  sqliteVec.load(db);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  return db;
}

function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      created_at TEXT NOT NULL
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
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_decisions_project ON decisions(project);
    CREATE INDEX IF NOT EXISTS idx_decisions_status ON decisions(status);

    CREATE VIRTUAL TABLE IF NOT EXISTS decisions_vec USING vec0(
      id TEXT PRIMARY KEY,
      embedding float[1024]
    );
  `);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/infra/db.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/infra/db.ts src/infra/db.test.ts
git commit -m "add SQLite + sqlite-vec database setup with migrations"
```

---

## Task 7: Project repository

**Files:**
- Create: `src/infra/project.repo.ts`
- Test: `src/infra/project.repo.test.ts`

- [ ] **Step 1: Write failing tests** — create project, find by name, find non-existent returns null, list projects, duplicate name throws, name normalization (lowercase, trim).

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/infra/project.repo.test.ts
```

- [ ] **Step 3: Implement project repo**

```ts
// src/infra/project.repo.ts

import Database from "better-sqlite3";
import { IProjectRepo, Project } from "../core/types.js";

export class ProjectRepo implements IProjectRepo {
  constructor(private db: Database.Database) {}

  create(project: Project): void {
    this.db.prepare(
      "INSERT INTO projects (id, name, description, created_at) VALUES (?, ?, ?, ?)"
    ).run(project.id, project.name, project.description, project.createdAt);
  }

  findByName(name: string): Project | null {
    const row = this.db.prepare("SELECT * FROM projects WHERE name = ?").get(name.toLowerCase().trim()) as any;
    if (!row) return null;
    return { id: row.id, name: row.name, description: row.description, createdAt: row.created_at };
  }

  list(): Project[] {
    const rows = this.db.prepare("SELECT * FROM projects ORDER BY name").all() as any[];
    return rows.map((row) => ({
      id: row.id, name: row.name, description: row.description, createdAt: row.created_at,
    }));
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/infra/project.repo.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/infra/project.repo.ts src/infra/project.repo.test.ts
git commit -m "add project repository with CRUD and name normalization"
```

---

## Task 8: Decision repository

**Files:**
- Create: `src/infra/decision.repo.ts`
- Test: `src/infra/decision.repo.test.ts`

- [ ] **Step 1: Write failing tests** — create decision with embedding, find by ID, find non-existent returns null, update decision (partial fields), update with new embedding, delete decision, delete non-existent is no-op, list with no filters, list filtered by project, list filtered by status, list with limit, list ordered by created_at desc, vector search returns scored results, vector search filtered by project.

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/infra/decision.repo.test.ts
```

- [ ] **Step 3: Implement decision repo**

The decision repo handles both the `decisions` table and the `decisions_vec` virtual table. Key operations:

- `create`: INSERT into both `decisions` and `decisions_vec`
- `update`: UPDATE `decisions`, optionally replace row in `decisions_vec`
- `delete`: DELETE from both tables
- `searchByVector`: query `decisions_vec` with cosine distance, JOIN with `decisions`

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/infra/decision.repo.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/infra/decision.repo.ts src/infra/decision.repo.test.ts
git commit -m "add decision repository with vector search and CRUD"
```

---

## Task 9: Decision service

**Files:**
- Create: `src/core/decision.service.ts`
- Test: `src/core/decision.service.test.ts`

- [ ] **Step 1: Write failing tests** — create decision (validates project exists, generates ID, computes embedding, delegates to repo), get by ID (returns decision, throws on not found), update (partial fields, re-computes embedding, throws on not found), delete (delegates to repo, throws on not found), list (delegates with filters), search (embeds query, delegates to repo, filters by threshold).

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/core/decision.service.test.ts
```

- [ ] **Step 3: Implement decision service**

```ts
// src/core/decision.service.ts

import { v4 as uuid } from "uuid";
import {
  CreateDecisionInput, Decision, DecisionStatus, IDecisionRepo, IProjectRepo,
  SearchInput, SearchResult, UpdateDecisionInput,
} from "./types.js";
import { EmbeddingService } from "./embedding.service.js";

export class DecisionService {
  constructor(
    private decisionRepo: IDecisionRepo,
    private projectRepo: IProjectRepo,
    private embeddingService: EmbeddingService
  ) {}

  async create(input: CreateDecisionInput): Promise<Decision> {
    const project = this.projectRepo.findByName(input.project);
    if (!project) {
      const available = this.projectRepo.list().map((p) => p.name);
      throw new Error(
        `Project '${input.project}' not found. Available projects: ${available.join(", ") || "none"}`
      );
    }

    const now = new Date().toISOString();
    const decision: Decision = {
      id: uuid(),
      project: project.name,
      title: input.title,
      context: input.context ?? null,
      alternatives: input.alternatives ?? null,
      tags: input.tags ?? null,
      status: input.status ?? "active",
      links: input.links ?? null,
      createdAt: now,
      updatedAt: now,
    };

    const embedding = await this.embeddingService.embedDecision(decision);
    this.decisionRepo.create(decision, embedding);
    return decision;
  }

  getById(id: string): Decision {
    const decision = this.decisionRepo.findById(id);
    if (!decision) throw new Error(`Decision '${id}' not found`);
    return decision;
  }

  async update(id: string, input: UpdateDecisionInput): Promise<Decision> {
    const existing = this.getById(id);
    if (input.project !== undefined) {
      const project = this.projectRepo.findByName(input.project);
      if (!project) {
        const available = this.projectRepo.list().map((p) => p.name);
        throw new Error(
          `Project '${input.project}' not found. Available projects: ${available.join(", ") || "none"}`
        );
      }
    }

    const merged = { ...existing, ...input, updatedAt: new Date().toISOString() };
    const embedding = await this.embeddingService.embedDecision(merged);
    this.decisionRepo.update(id, { ...input }, embedding);
    return merged;
  }

  delete(id: string): void {
    this.getById(id); // throws if not found
    this.decisionRepo.delete(id);
  }

  list(filters: { project?: string; status?: DecisionStatus; limit?: number }): Decision[] {
    return this.decisionRepo.list({
      project: filters.project,
      status: filters.status,
      limit: filters.limit ?? 20,
    });
  }

  async search(input: SearchInput): Promise<SearchResult[]> {
    const embedding = await this.embeddingService.embedQuery(input.query);
    const results = this.decisionRepo.searchByVector(
      embedding, input.limit ?? 5, input.project
    );
    if (input.threshold !== undefined) {
      return results.filter((r) => r.score >= input.threshold!);
    }
    return results;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/core/decision.service.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/core/decision.service.ts src/core/decision.service.test.ts
git commit -m "add decision service with CRUD, search, and validation"
```

---

## Task 10: Project service

**Files:**
- Create: `src/core/project.service.ts`
- Test: `src/core/project.service.test.ts`

- [ ] **Step 1: Write failing tests** — create project (normalizes name, generates ID, delegates to repo), create duplicate throws, list projects.

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/core/project.service.test.ts
```

- [ ] **Step 3: Implement project service**

```ts
// src/core/project.service.ts

import { v4 as uuid } from "uuid";
import { IProjectRepo, Project } from "./types.js";

export class ProjectService {
  constructor(private projectRepo: IProjectRepo) {}

  create(name: string, description?: string): Project {
    const normalized = name.toLowerCase().trim();
    const existing = this.projectRepo.findByName(normalized);
    if (existing) {
      throw new Error(`Project '${normalized}' already exists`);
    }

    const project: Project = {
      id: uuid(),
      name: normalized,
      description: description ?? null,
      createdAt: new Date().toISOString(),
    };

    this.projectRepo.create(project);
    return project;
  }

  list(): Project[] {
    return this.projectRepo.list();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/core/project.service.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/core/project.service.ts src/core/project.service.test.ts
git commit -m "add project service with name normalization and duplicate check"
```

---

## Task 11: CLI — project commands

**Files:**
- Create: `src/cli/commands/project.ts`, `src/cli/index.ts`, `bin/logd.ts`
- Test: manual verification

- [ ] **Step 1: Implement project commands**

Wire up `logd project create <name>` and `logd project list` using Commander. Create the CLI entrypoint and bin script.

- [ ] **Step 2: Add bin entry to package.json**

```json
{
  "bin": { "logd": "./dist/bin/logd.js" }
}
```

- [ ] **Step 3: Build and test manually**

```bash
npx tsc
node dist/bin/logd.js project create "test-project" -d "A test project"
node dist/bin/logd.js project list
```

- [ ] **Step 4: Commit**

```bash
git add src/cli/ bin/ package.json
git commit -m "add CLI entrypoint and project create/list commands"
```

---

## Task 12: CLI — add command

**Files:**
- Create: `src/cli/commands/add.ts`

- [ ] **Step 1: Implement add command**

Wire up `logd add <title>` with all flags (`--project`, `--context`, `--alternatives`, `--tags`, `--status`, `--links`). Instantiate the dependency graph (db → repos → services) and delegate to `DecisionService.create`.

- [ ] **Step 2: Build and test manually**

```bash
npx tsc
node dist/bin/logd.js add "Use PostgreSQL for persistence" -p test-project -c "Need ACID transactions" -t backend database
```

- [ ] **Step 3: Commit**

```bash
git add src/cli/commands/add.ts src/cli/index.ts
git commit -m "add CLI add command"
```

---

## Task 13: CLI — search command

**Files:**
- Create: `src/cli/commands/search.ts`

- [ ] **Step 1: Implement search command**

Wire up `logd search <query>` with flags (`--project`, `--limit`, `--threshold`, `--verbose`). Compact output by default (title, project, score, ID), verbose shows all fields.

- [ ] **Step 2: Build and test manually**

```bash
npx tsc
node dist/bin/logd.js search "why did we choose a database?"
node dist/bin/logd.js search "database" -p test-project --verbose
```

- [ ] **Step 3: Commit**

```bash
git add src/cli/commands/search.ts src/cli/index.ts
git commit -m "add CLI search command with compact/verbose output"
```

---

## Task 14: CLI — show command

**Files:**
- Create: `src/cli/commands/show.ts`

- [ ] **Step 1: Implement show command** — `logd show <id>`, always full detail output (all fields).

- [ ] **Step 2: Build and test manually**

```bash
npx tsc
node dist/bin/logd.js show <id>
```

- [ ] **Step 3: Commit**

```bash
git add src/cli/commands/show.ts src/cli/index.ts
git commit -m "add CLI show command"
```

---

## Task 15: CLI — list command

**Files:**
- Create: `src/cli/commands/list.ts`

- [ ] **Step 1: Implement list command** — `logd list` with `--project`, `--status`, `--limit`. Compact output, ordered by created_at desc.

- [ ] **Step 2: Build and test manually**

```bash
npx tsc
node dist/bin/logd.js list
node dist/bin/logd.js list -p test-project --status active
```

- [ ] **Step 3: Commit**

```bash
git add src/cli/commands/list.ts src/cli/index.ts
git commit -m "add CLI list command"
```

---

## Task 16: CLI — edit command

**Files:**
- Create: `src/cli/commands/edit.ts`

- [ ] **Step 1: Implement edit command** — `logd edit <id>` with partial update flags. Array flags (`--alternatives`, `--tags`, `--links`) replace the entire array. Re-computes embedding.

- [ ] **Step 2: Build and test manually**

```bash
npx tsc
node dist/bin/logd.js edit <id> --status superseded
node dist/bin/logd.js edit <id> --tags new-tag
```

- [ ] **Step 3: Commit**

```bash
git add src/cli/commands/edit.ts src/cli/index.ts
git commit -m "add CLI edit command with partial update"
```

---

## Task 17: CLI — delete command

**Files:**
- Create: `src/cli/commands/delete.ts`

- [ ] **Step 1: Implement delete command** — `logd delete <id>`, immediate, no confirmation prompt.

- [ ] **Step 2: Build and test manually**

```bash
npx tsc
node dist/bin/logd.js delete <id>
```

- [ ] **Step 3: Commit**

```bash
git add src/cli/commands/delete.ts src/cli/index.ts
git commit -m "add CLI delete command"
```

---

## Task 18: MCP server

**Files:**
- Create: `src/mcp/server.ts`, `src/cli/commands/serve.ts`
- Test: `src/mcp/server.test.ts`

- [ ] **Step 1: Write failing tests** — tool registration (all 8 tools listed), tool input schemas match expected shapes, tool handlers delegate to correct service methods and return proper JSON (mock services, verify calls and return values).

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/mcp/server.test.ts
```

- [ ] **Step 3: Implement MCP server**

Create the MCP server using `@modelcontextprotocol/sdk`. Register all 8 tools (`logd_add_decision`, `logd_search_decisions`, `logd_show_decision`, `logd_edit_decision`, `logd_delete_decision`, `logd_list_decisions`, `logd_create_project`, `logd_list_projects`). Each tool handler delegates to the appropriate service method. Returns JSON.

- [ ] **Step 4: Implement serve command** — `logd serve` starts the MCP server with stdio transport.

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run src/mcp/server.test.ts
```

- [ ] **Step 6: Build and test manually**

```bash
npx tsc
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node dist/bin/logd.js serve
```

- [ ] **Step 7: Commit**

```bash
git add src/mcp/ src/cli/commands/serve.ts src/cli/index.ts
git commit -m "add MCP server with all 8 tools via stdio transport"
```

---

## Task 19: E2E smoke tests

**Files:**
- Create: `tests/e2e/cli.test.ts`

- [ ] **Step 1: Write E2E tests** — full workflow: create project → add decision → search → show → edit → list → delete. Run actual CLI binary, assert output. Uses a mock Ollama server (simple HTTP server returning fixed vectors) to avoid requiring a running Ollama instance.

- [ ] **Step 2: Run tests**

```bash
npx vitest run tests/e2e/cli.test.ts
```

- [ ] **Step 3: Fix any issues**

- [ ] **Step 4: Commit**

```bash
git add tests/
git commit -m "add E2E smoke tests for CLI workflow"
```

---

## Task order and dependencies

```
Task 1  (scaffolding)
  └─→ Task 2  (types)
        ├─→ Task 3  (config)
        ├─→ Task 4  (embedding service)
        ├─→ Task 5  (ollama client)
        ├─→ Task 6  (db setup)
        │     ├─→ Task 7  (project repo)
        │     └─→ Task 8  (decision repo)
        ├─→ Task 9  (decision service) ← depends on 4, 7, 8
        └─→ Task 10 (project service) ← depends on 7
              └─→ Task 11 (CLI entrypoint + project commands) ← depends on 3, 10
                    ├─→ Task 12 (CLI add) ← depends on 9
                    ├─→ Task 13 (CLI search) ← depends on 9
                    ├─→ Task 14 (CLI show) ← depends on 9
                    ├─→ Task 15 (CLI list) ← depends on 9
                    ├─→ Task 16 (CLI edit) ← depends on 9
                    └─→ Task 17 (CLI delete) ← depends on 9
                          └─→ Task 18 (MCP server) ← depends on 12-17
                                └─→ Task 19 (E2E tests)
```

**Parallel groups:**
- Tasks 3, 4, 5, 6 can be worked in parallel once Task 2 is done
- Tasks 9 and 10 can be worked in parallel once their deps (4, 7, 8) are done
- Tasks 12-17 (all CLI commands) can be worked in parallel once Task 11 is done
