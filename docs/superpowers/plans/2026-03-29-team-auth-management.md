# Team & Auth Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-tenant team support to the logd server — users, teams, DB-backed tokens, role-based access, team-scoped data.

**Architecture:** Extends existing hexagonal architecture with new domain/port/adapter sets for users, teams, tokens. Replaces single-token auth with DB-backed bearer auth + team membership middleware. All existing decision/project queries gain team scoping.

**Tech Stack:** Hono (bearerAuth middleware), better-sqlite3, node:crypto (SHA-256, randomBytes), Vitest

**Spec:** `docs/superpowers/specs/2026-03-29-team-auth-management-design.md` (GitHub issue #35)

---

## File Structure

### New Files
```
packages/shared/src/types.ts                                    # Add User, Team, TeamRole, TeamMember, Token types

packages/server/src/
  domain/
    user.ts                                                     # buildUser()
    team.ts                                                     # buildTeam()
    token.ts                                                    # generateToken(), hashToken()

  ports/
    user.repository.ts                                          # UserRepository interface
    team.repository.ts                                          # TeamRepository interface
    token.repository.ts                                         # TokenRepository interface

  application/
    user.service.ts                                             # create user + initial token, list by team
    user.service.test.ts
    team.service.ts                                             # CRUD team, manage members
    team.service.test.ts
    token.service.ts                                            # create/revoke/list, authenticate
    token.service.test.ts
    bootstrap.ts                                                # seed logic
    bootstrap.test.ts

  adapters/
    persistence/
      sqlite.user.repo.ts
      sqlite.user.repo.test.ts
      sqlite.team.repo.ts
      sqlite.team.repo.test.ts
      sqlite.token.repo.ts
      sqlite.token.repo.test.ts
    http/
      middleware/
        auth.ts                                                 # rewritten — bearerAuth + verifyToken
        auth.test.ts                                            # rewritten tests
        team.ts                                                 # X-Team → membership check
        team.test.ts
        role.ts                                                 # admin guard
        role.test.ts
      routes/
        teams.ts
        teams.test.ts
        users.ts
        users.test.ts
        tokens.ts
        tokens.test.ts
```

### Modified Files
```
packages/server/src/adapters/persistence/database.ts            # New tables, team_id migration
packages/server/src/ports/project.repository.ts                 # Add teamId param to create/findByName/list
packages/server/src/ports/decision.repository.ts                # Add teamId param to list/searchByVector
packages/server/src/adapters/persistence/sqlite.project.repo.ts # team_id column, filtered queries
packages/server/src/adapters/persistence/sqlite.project.repo.test.ts
packages/server/src/adapters/persistence/sqlite.decision.repo.ts  # Join projects for team filtering
packages/server/src/adapters/persistence/sqlite.decision.repo.test.ts
packages/server/src/application/project.service.ts              # teamId in create/findByName
packages/server/src/application/project.service.test.ts
packages/server/src/application/decision.service.ts             # teamId in list/search
packages/server/src/application/decision.service.test.ts
packages/server/src/adapters/http/app.ts                        # New AppEnv type, new routes, new middleware
packages/server/src/adapters/http/routes/decisions.ts           # Read teamId from context
packages/server/src/adapters/http/routes/decisions.test.ts
packages/server/src/adapters/http/routes/projects.ts            # Read teamId from context
packages/server/src/adapters/http/routes/projects.test.ts
packages/server/src/index.ts                                    # Wire new repos/services, run bootstrap
```

---

### Task 1: Shared types — User, Team, Token

**Files:**
- Modify: `packages/shared/src/types.ts`

- [ ] **Step 1: Add new types to shared**

Append after the `SearchResult` interface:

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

export const TEAM_ROLES = ["admin", "member"] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

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

- [ ] **Step 2: Build shared**

Run: `npm run build -w packages/shared`
Expected: clean build

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/types.ts
git commit -m "feat(shared): add User, Team, TeamMember, Token types"
```

---

### Task 2: Domain layer — user, team, token

**Files:**
- Create: `packages/server/src/domain/user.ts`
- Create: `packages/server/src/domain/team.ts`
- Create: `packages/server/src/domain/token.ts`

- [ ] **Step 1: Write user domain**

```typescript
import { randomUUID } from "node:crypto";
import type { User } from "@logd/shared";

export function buildUser(email: string, name: string): User {
	return {
		id: randomUUID(),
		email,
		name,
		createdAt: new Date().toISOString(),
	};
}
```

- [ ] **Step 2: Write team domain**

```typescript
import { randomUUID } from "node:crypto";
import type { Team } from "@logd/shared";

export function buildTeam(name: string): Team {
	return {
		id: randomUUID(),
		name,
		createdAt: new Date().toISOString(),
	};
}
```

- [ ] **Step 3: Write token domain**

```typescript
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Token } from "@logd/shared";

export function generateRawToken(): string {
	return randomBytes(32).toString("hex");
}

export function hashToken(raw: string): string {
	return createHash("sha256").update(raw).digest("hex");
}

export function buildToken(userId: string, name: string, tokenHash: string): Token {
	return {
		id: randomUUID(),
		userId,
		name,
		createdAt: new Date().toISOString(),
		lastUsedAt: null,
	};
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck -w packages/server`

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/domain/user.ts packages/server/src/domain/team.ts packages/server/src/domain/token.ts
git commit -m "feat(server): domain layer — user, team, token builders"
```

---

### Task 3: Port interfaces — user, team, token repositories

**Files:**
- Create: `packages/server/src/ports/user.repository.ts`
- Create: `packages/server/src/ports/team.repository.ts`
- Create: `packages/server/src/ports/token.repository.ts`

- [ ] **Step 1: Write UserRepository port**

```typescript
import type { User } from "@logd/shared";

export interface UserRepository {
	create(user: User): void;
	findById(id: string): User | null;
	findByEmail(email: string): User | null;
	listByTeam(teamId: string): User[];
	isEmpty(): boolean;
}
```

- [ ] **Step 2: Write TeamRepository port**

```typescript
import type { Team, TeamMember, TeamRole } from "@logd/shared";

export interface TeamRepository {
	create(team: Team): void;
	findById(id: string): Team | null;
	findByName(name: string): Team | null;
	listByUser(userId: string): Team[];
	delete(id: string): void;
	hasProjects(teamId: string): boolean;

	addMember(teamId: string, userId: string, role: TeamRole): void;
	removeMember(teamId: string, userId: string): void;
	updateMemberRole(teamId: string, userId: string, role: TeamRole): void;
	getMembership(userId: string, teamName: string): { teamId: string; role: TeamRole } | null;
	listMembers(teamId: string): TeamMember[];
}
```

- [ ] **Step 3: Write TokenRepository port**

```typescript
import type { Token } from "@logd/shared";

export interface TokenRepository {
	create(token: Token, tokenHash: string): void;
	findByHash(tokenHash: string): { token: Token; userId: string } | null;
	listByUser(userId: string): Token[];
	delete(id: string): void;
	touchLastUsed(tokenHash: string): void;
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck -w packages/server`

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/ports/user.repository.ts packages/server/src/ports/team.repository.ts packages/server/src/ports/token.repository.ts
git commit -m "feat(server): port interfaces — user, team, token repositories"
```

---

### Task 4: Database migration — new tables + team_id

**Files:**
- Modify: `packages/server/src/adapters/persistence/database.ts`

- [ ] **Step 1: Add new tables and team_id migration**

Replace the current `createDatabase` function body. After the existing `CREATE TABLE` statements and before `return db`, add the new tables and migration:

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

		CREATE TABLE IF NOT EXISTS projects (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL UNIQUE,
			description TEXT,
			team_id TEXT REFERENCES teams(id),
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

	// Migration: add team_id to projects if missing
	const projectColumns = db.pragma("table_info(projects)") as { name: string }[];
	const columnNames = projectColumns.map((c) => c.name);
	if (!columnNames.includes("team_id")) {
		db.exec("ALTER TABLE projects ADD COLUMN team_id TEXT REFERENCES teams(id)");
	}

	return db;
}

export function createInMemoryDatabase(): Database.Database {
	return createDatabase(":memory:");
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck -w packages/server`

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/adapters/persistence/database.ts
git commit -m "feat(server): database migration — user/team/token tables, team_id on projects"
```

---

### Task 5: SQLite user repository

**Files:**
- Create: `packages/server/src/adapters/persistence/sqlite.user.repo.ts`
- Create: `packages/server/src/adapters/persistence/sqlite.user.repo.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import type { User } from "@logd/shared";
import { createInMemoryDatabase } from "./database.js";
import { SqliteUserRepo } from "./sqlite.user.repo.js";

function makeUser(overrides?: Partial<User>): User {
	return {
		id: "u-1",
		email: "tony@example.com",
		name: "Tony",
		createdAt: "2026-01-01T00:00:00.000Z",
		...overrides,
	};
}

describe("SqliteUserRepo", () => {
	let repo: SqliteUserRepo;

	beforeEach(() => {
		const db = createInMemoryDatabase();
		repo = new SqliteUserRepo(db);
	});

	it("create + findById round-trips", () => {
		repo.create(makeUser());
		const found = repo.findById("u-1");
		expect(found).not.toBeNull();
		expect(found?.email).toBe("tony@example.com");
	});

	it("findById returns null for missing", () => {
		expect(repo.findById("nope")).toBeNull();
	});

	it("findByEmail is case-insensitive", () => {
		repo.create(makeUser());
		const found = repo.findByEmail("Tony@Example.com");
		expect(found).not.toBeNull();
	});

	it("findByEmail returns null for missing", () => {
		expect(repo.findByEmail("nope@example.com")).toBeNull();
	});

	it("throws on duplicate email", () => {
		repo.create(makeUser());
		expect(() => repo.create(makeUser({ id: "u-2" }))).toThrow();
	});

	it("isEmpty returns true on empty DB", () => {
		expect(repo.isEmpty()).toBe(true);
	});

	it("isEmpty returns false after create", () => {
		repo.create(makeUser());
		expect(repo.isEmpty()).toBe(false);
	});

	it("listByTeam returns users in team", () => {
		const db = createInMemoryDatabase();
		const userRepo = new SqliteUserRepo(db);
		userRepo.create(makeUser());
		// Need team + membership for listByTeam — seed directly
		db.exec(`
			INSERT INTO teams (id, name, created_at) VALUES ('t-1', 'acme', '2026-01-01');
			INSERT INTO team_members (user_id, team_id, role, created_at) VALUES ('u-1', 't-1', 'admin', '2026-01-01');
		`);
		const users = userRepo.listByTeam("t-1");
		expect(users).toHaveLength(1);
		expect(users[0].id).toBe("u-1");
	});
});
```

- [ ] **Step 2: Run tests — expect fail**

Run: `npm run test -w packages/server -- --reporter verbose`

- [ ] **Step 3: Implement SqliteUserRepo**

```typescript
import type Database from "better-sqlite3";
import type { User } from "@logd/shared";
import type { UserRepository } from "../../ports/user.repository.js";

interface UserRow {
	id: string;
	email: string;
	name: string;
	created_at: string;
}

function rowToUser(row: UserRow): User {
	return {
		id: row.id,
		email: row.email,
		name: row.name,
		createdAt: row.created_at,
	};
}

export class SqliteUserRepo implements UserRepository {
	constructor(private db: Database.Database) {}

	create(user: User): void {
		this.db
			.prepare("INSERT INTO users (id, email, name, created_at) VALUES (?, ?, ?, ?)")
			.run(user.id, user.email, user.name, user.createdAt);
	}

	findById(id: string): User | null {
		const row = this.db
			.prepare("SELECT id, email, name, created_at FROM users WHERE id = ?")
			.get(id) as UserRow | undefined;
		return row ? rowToUser(row) : null;
	}

	findByEmail(email: string): User | null {
		const row = this.db
			.prepare("SELECT id, email, name, created_at FROM users WHERE LOWER(email) = LOWER(?)")
			.get(email) as UserRow | undefined;
		return row ? rowToUser(row) : null;
	}

	listByTeam(teamId: string): User[] {
		const rows = this.db
			.prepare(
				`SELECT u.id, u.email, u.name, u.created_at
				 FROM users u
				 JOIN team_members tm ON u.id = tm.user_id
				 WHERE tm.team_id = ?
				 ORDER BY u.name`,
			)
			.all(teamId) as UserRow[];
		return rows.map(rowToUser);
	}

	isEmpty(): boolean {
		const row = this.db.prepare("SELECT 1 FROM users LIMIT 1").get();
		return row === undefined;
	}
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npm run test -w packages/server -- --reporter verbose`

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/adapters/persistence/sqlite.user.repo.ts packages/server/src/adapters/persistence/sqlite.user.repo.test.ts
git commit -m "feat(server): SQLite user repository with tests"
```

---

### Task 6: SQLite team repository

**Files:**
- Create: `packages/server/src/adapters/persistence/sqlite.team.repo.ts`
- Create: `packages/server/src/adapters/persistence/sqlite.team.repo.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import type { Team } from "@logd/shared";
import { createInMemoryDatabase } from "./database.js";
import { SqliteTeamRepo } from "./sqlite.team.repo.js";
import { SqliteUserRepo } from "./sqlite.user.repo.js";
import { SqliteProjectRepo } from "./sqlite.project.repo.js";
import type Database from "better-sqlite3";

function makeTeam(overrides?: Partial<Team>): Team {
	return {
		id: "t-1",
		name: "acme",
		createdAt: "2026-01-01T00:00:00.000Z",
		...overrides,
	};
}

describe("SqliteTeamRepo", () => {
	let db: Database.Database;
	let repo: SqliteTeamRepo;

	beforeEach(() => {
		db = createInMemoryDatabase();
		repo = new SqliteTeamRepo(db);
	});

	it("create + findById round-trips", () => {
		repo.create(makeTeam());
		const found = repo.findById("t-1");
		expect(found).not.toBeNull();
		expect(found?.name).toBe("acme");
	});

	it("findByName is case-insensitive", () => {
		repo.create(makeTeam());
		expect(repo.findByName("ACME")).not.toBeNull();
	});

	it("findByName returns null for missing", () => {
		expect(repo.findByName("nope")).toBeNull();
	});

	it("throws on duplicate team name", () => {
		repo.create(makeTeam());
		expect(() => repo.create(makeTeam({ id: "t-2" }))).toThrow();
	});

	it("delete removes team", () => {
		repo.create(makeTeam());
		repo.delete("t-1");
		expect(repo.findById("t-1")).toBeNull();
	});

	it("hasProjects returns false for empty team", () => {
		repo.create(makeTeam());
		expect(repo.hasProjects("t-1")).toBe(false);
	});

	it("hasProjects returns true when team has projects", () => {
		repo.create(makeTeam());
		db.exec(
			"INSERT INTO projects (id, name, team_id, created_at) VALUES ('p-1', 'proj', 't-1', '2026-01-01')",
		);
		expect(repo.hasProjects("t-1")).toBe(true);
	});

	describe("membership", () => {
		beforeEach(() => {
			repo.create(makeTeam());
			const userRepo = new SqliteUserRepo(db);
			userRepo.create({
				id: "u-1",
				email: "tony@example.com",
				name: "Tony",
				createdAt: "2026-01-01T00:00:00.000Z",
			});
		});

		it("addMember + getMembership", () => {
			repo.addMember("t-1", "u-1", "admin");
			const m = repo.getMembership("u-1", "acme");
			expect(m).not.toBeNull();
			expect(m?.teamId).toBe("t-1");
			expect(m?.role).toBe("admin");
		});

		it("getMembership returns null for non-member", () => {
			expect(repo.getMembership("u-1", "acme")).toBeNull();
		});

		it("removeMember", () => {
			repo.addMember("t-1", "u-1", "admin");
			repo.removeMember("t-1", "u-1");
			expect(repo.getMembership("u-1", "acme")).toBeNull();
		});

		it("updateMemberRole", () => {
			repo.addMember("t-1", "u-1", "member");
			repo.updateMemberRole("t-1", "u-1", "admin");
			const m = repo.getMembership("u-1", "acme");
			expect(m?.role).toBe("admin");
		});

		it("listMembers returns all members", () => {
			repo.addMember("t-1", "u-1", "admin");
			const members = repo.listMembers("t-1");
			expect(members).toHaveLength(1);
			expect(members[0].userId).toBe("u-1");
		});

		it("listByUser returns user's teams", () => {
			repo.addMember("t-1", "u-1", "admin");
			const teams = repo.listByUser("u-1");
			expect(teams).toHaveLength(1);
			expect(teams[0].name).toBe("acme");
		});
	});
});
```

- [ ] **Step 2: Run tests — expect fail**

Run: `npm run test -w packages/server -- --reporter verbose`

- [ ] **Step 3: Implement SqliteTeamRepo**

```typescript
import type Database from "better-sqlite3";
import type { Team, TeamMember, TeamRole } from "@logd/shared";
import type { TeamRepository } from "../../ports/team.repository.js";

interface TeamRow {
	id: string;
	name: string;
	created_at: string;
}

function rowToTeam(row: TeamRow): Team {
	return { id: row.id, name: row.name, createdAt: row.created_at };
}

interface MemberRow {
	user_id: string;
	team_id: string;
	role: string;
	created_at: string;
}

function rowToMember(row: MemberRow): TeamMember {
	return {
		userId: row.user_id,
		teamId: row.team_id,
		role: row.role as TeamRole,
		createdAt: row.created_at,
	};
}

export class SqliteTeamRepo implements TeamRepository {
	constructor(private db: Database.Database) {}

	create(team: Team): void {
		this.db
			.prepare("INSERT INTO teams (id, name, created_at) VALUES (?, ?, ?)")
			.run(team.id, team.name, team.createdAt);
	}

	findById(id: string): Team | null {
		const row = this.db
			.prepare("SELECT id, name, created_at FROM teams WHERE id = ?")
			.get(id) as TeamRow | undefined;
		return row ? rowToTeam(row) : null;
	}

	findByName(name: string): Team | null {
		const row = this.db
			.prepare("SELECT id, name, created_at FROM teams WHERE LOWER(name) = LOWER(?)")
			.get(name) as TeamRow | undefined;
		return row ? rowToTeam(row) : null;
	}

	listByUser(userId: string): Team[] {
		const rows = this.db
			.prepare(
				`SELECT t.id, t.name, t.created_at
				 FROM teams t
				 JOIN team_members tm ON t.id = tm.team_id
				 WHERE tm.user_id = ?
				 ORDER BY t.name`,
			)
			.all(userId) as TeamRow[];
		return rows.map(rowToTeam);
	}

	delete(id: string): void {
		this.db.prepare("DELETE FROM team_members WHERE team_id = ?").run(id);
		this.db.prepare("DELETE FROM teams WHERE id = ?").run(id);
	}

	hasProjects(teamId: string): boolean {
		const row = this.db
			.prepare("SELECT 1 FROM projects WHERE team_id = ? LIMIT 1")
			.get(teamId);
		return row !== undefined;
	}

	addMember(teamId: string, userId: string, role: TeamRole): void {
		this.db
			.prepare(
				"INSERT INTO team_members (team_id, user_id, role, created_at) VALUES (?, ?, ?, ?)",
			)
			.run(teamId, userId, role, new Date().toISOString());
	}

	removeMember(teamId: string, userId: string): void {
		this.db
			.prepare("DELETE FROM team_members WHERE team_id = ? AND user_id = ?")
			.run(teamId, userId);
	}

	updateMemberRole(teamId: string, userId: string, role: TeamRole): void {
		this.db
			.prepare("UPDATE team_members SET role = ? WHERE team_id = ? AND user_id = ?")
			.run(role, teamId, userId);
	}

	getMembership(userId: string, teamName: string): { teamId: string; role: TeamRole } | null {
		const row = this.db
			.prepare(
				`SELECT tm.team_id, tm.role
				 FROM team_members tm
				 JOIN teams t ON tm.team_id = t.id
				 WHERE tm.user_id = ? AND LOWER(t.name) = LOWER(?)`,
			)
			.get(userId, teamName) as { team_id: string; role: string } | undefined;
		return row ? { teamId: row.team_id, role: row.role as TeamRole } : null;
	}

	listMembers(teamId: string): TeamMember[] {
		const rows = this.db
			.prepare(
				"SELECT user_id, team_id, role, created_at FROM team_members WHERE team_id = ? ORDER BY created_at",
			)
			.all(teamId) as MemberRow[];
		return rows.map(rowToMember);
	}
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npm run test -w packages/server -- --reporter verbose`

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/adapters/persistence/sqlite.team.repo.ts packages/server/src/adapters/persistence/sqlite.team.repo.test.ts
git commit -m "feat(server): SQLite team repository with membership + tests"
```

---

### Task 7: SQLite token repository

**Files:**
- Create: `packages/server/src/adapters/persistence/sqlite.token.repo.ts`
- Create: `packages/server/src/adapters/persistence/sqlite.token.repo.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import type { Token } from "@logd/shared";
import { createInMemoryDatabase } from "./database.js";
import { SqliteTokenRepo } from "./sqlite.token.repo.js";
import type Database from "better-sqlite3";

function seedUser(db: Database.Database): void {
	db.exec(
		"INSERT INTO users (id, email, name, created_at) VALUES ('u-1', 'tony@example.com', 'Tony', '2026-01-01')",
	);
}

function makeToken(overrides?: Partial<Token>): Token {
	return {
		id: "tk-1",
		userId: "u-1",
		name: "laptop",
		createdAt: "2026-01-01T00:00:00.000Z",
		lastUsedAt: null,
		...overrides,
	};
}

describe("SqliteTokenRepo", () => {
	let db: Database.Database;
	let repo: SqliteTokenRepo;

	beforeEach(() => {
		db = createInMemoryDatabase();
		seedUser(db);
		repo = new SqliteTokenRepo(db);
	});

	it("create + findByHash round-trips", () => {
		repo.create(makeToken(), "abc123hash");
		const found = repo.findByHash("abc123hash");
		expect(found).not.toBeNull();
		expect(found?.token.name).toBe("laptop");
		expect(found?.userId).toBe("u-1");
	});

	it("findByHash returns null for missing", () => {
		expect(repo.findByHash("nope")).toBeNull();
	});

	it("listByUser returns user's tokens", () => {
		repo.create(makeToken(), "hash1");
		repo.create(makeToken({ id: "tk-2", name: "ci" }), "hash2");
		const tokens = repo.listByUser("u-1");
		expect(tokens).toHaveLength(2);
	});

	it("delete removes token", () => {
		repo.create(makeToken(), "hash1");
		repo.delete("tk-1");
		expect(repo.findByHash("hash1")).toBeNull();
	});

	it("touchLastUsed updates timestamp", () => {
		repo.create(makeToken(), "hash1");
		repo.touchLastUsed("hash1");
		const found = repo.findByHash("hash1");
		expect(found?.token.lastUsedAt).not.toBeNull();
	});
});
```

- [ ] **Step 2: Run tests — expect fail**

Run: `npm run test -w packages/server -- --reporter verbose`

- [ ] **Step 3: Implement SqliteTokenRepo**

```typescript
import type Database from "better-sqlite3";
import type { Token } from "@logd/shared";
import type { TokenRepository } from "../../ports/token.repository.js";

interface TokenRow {
	id: string;
	user_id: string;
	token_hash: string;
	name: string;
	created_at: string;
	last_used_at: string | null;
}

function rowToToken(row: TokenRow): Token {
	return {
		id: row.id,
		userId: row.user_id,
		name: row.name,
		createdAt: row.created_at,
		lastUsedAt: row.last_used_at,
	};
}

export class SqliteTokenRepo implements TokenRepository {
	constructor(private db: Database.Database) {}

	create(token: Token, tokenHash: string): void {
		this.db
			.prepare(
				"INSERT INTO tokens (id, user_id, token_hash, name, created_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?)",
			)
			.run(token.id, token.userId, tokenHash, token.name, token.createdAt, token.lastUsedAt);
	}

	findByHash(tokenHash: string): { token: Token; userId: string } | null {
		const row = this.db
			.prepare(
				"SELECT id, user_id, token_hash, name, created_at, last_used_at FROM tokens WHERE token_hash = ?",
			)
			.get(tokenHash) as TokenRow | undefined;
		return row ? { token: rowToToken(row), userId: row.user_id } : null;
	}

	listByUser(userId: string): Token[] {
		const rows = this.db
			.prepare(
				"SELECT id, user_id, token_hash, name, created_at, last_used_at FROM tokens WHERE user_id = ? ORDER BY created_at DESC",
			)
			.all(userId) as TokenRow[];
		return rows.map(rowToToken);
	}

	delete(id: string): void {
		this.db.prepare("DELETE FROM tokens WHERE id = ?").run(id);
	}

	touchLastUsed(tokenHash: string): void {
		this.db
			.prepare("UPDATE tokens SET last_used_at = ? WHERE token_hash = ?")
			.run(new Date().toISOString(), tokenHash);
	}
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npm run test -w packages/server -- --reporter verbose`

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/adapters/persistence/sqlite.token.repo.ts packages/server/src/adapters/persistence/sqlite.token.repo.test.ts
git commit -m "feat(server): SQLite token repository with tests"
```

---

### Task 8: Token service

**Files:**
- Create: `packages/server/src/application/token.service.ts`
- Create: `packages/server/src/application/token.service.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Token } from "@logd/shared";
import type { TokenRepository } from "../ports/token.repository.js";
import { TokenService } from "./token.service.js";

function mockTokenRepo(): TokenRepository {
	const store = new Map<string, { token: Token; hash: string }>();
	return {
		create: vi.fn((token: Token, hash: string) => {
			store.set(hash, { token, hash });
		}),
		findByHash: vi.fn((hash: string) => {
			const entry = store.get(hash);
			return entry ? { token: entry.token, userId: entry.token.userId } : null;
		}),
		listByUser: vi.fn(() => [...store.values()].map((e) => e.token)),
		delete: vi.fn(),
		touchLastUsed: vi.fn(),
	};
}

describe("TokenService", () => {
	let service: TokenService;
	let repo: ReturnType<typeof mockTokenRepo>;

	beforeEach(() => {
		repo = mockTokenRepo();
		service = new TokenService(repo);
	});

	it("create returns raw token and stores hashed", () => {
		const result = service.create("u-1", "laptop");
		expect(result.raw).toHaveLength(64); // 32 bytes hex
		expect(result.token.userId).toBe("u-1");
		expect(repo.create).toHaveBeenCalled();
	});

	it("authenticate returns userId for valid token", () => {
		const { raw } = service.create("u-1", "laptop");
		const result = service.authenticate(raw);
		expect(result).not.toBeNull();
		expect(result?.id).toBe("u-1");
	});

	it("authenticate returns null for invalid token", () => {
		expect(service.authenticate("badtoken")).toBeNull();
	});

	it("touch calls repo.touchLastUsed", () => {
		const { raw } = service.create("u-1", "laptop");
		service.touch(raw);
		expect(repo.touchLastUsed).toHaveBeenCalled();
	});

	it("list delegates to repo", () => {
		service.list("u-1");
		expect(repo.listByUser).toHaveBeenCalledWith("u-1");
	});

	it("revoke delegates to repo", () => {
		service.revoke("tk-1");
		expect(repo.delete).toHaveBeenCalledWith("tk-1");
	});
});
```

- [ ] **Step 2: Run tests — expect fail**

Run: `npm run test -w packages/server -- --reporter verbose`

- [ ] **Step 3: Implement TokenService**

```typescript
import type { Token, User } from "@logd/shared";
import { buildToken, generateRawToken, hashToken } from "../domain/token.js";
import type { TokenRepository } from "../ports/token.repository.js";

export class TokenService {
	constructor(private repo: TokenRepository) {}

	create(userId: string, name: string): { raw: string; token: Token } {
		const raw = generateRawToken();
		const hash = hashToken(raw);
		const token = buildToken(userId, name, hash);
		this.repo.create(token, hash);
		return { raw, token };
	}

	createWithRaw(userId: string, name: string, rawToken: string): Token {
		const hash = hashToken(rawToken);
		const token = buildToken(userId, name, hash);
		this.repo.create(token, hash);
		return token;
	}

	authenticate(rawToken: string): { id: string } | null {
		const hash = hashToken(rawToken);
		const result = this.repo.findByHash(hash);
		return result ? { id: result.userId } : null;
	}

	touch(rawToken: string): void {
		const hash = hashToken(rawToken);
		this.repo.touchLastUsed(hash);
	}

	list(userId: string): Token[] {
		return this.repo.listByUser(userId);
	}

	revoke(tokenId: string): void {
		this.repo.delete(tokenId);
	}
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npm run test -w packages/server -- --reporter verbose`

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/application/token.service.ts packages/server/src/application/token.service.test.ts
git commit -m "feat(server): token service — create, authenticate, revoke"
```

---

### Task 9: Team service

**Files:**
- Create: `packages/server/src/application/team.service.ts`
- Create: `packages/server/src/application/team.service.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Team, TeamMember, TeamRole } from "@logd/shared";
import type { TeamRepository } from "../ports/team.repository.js";
import { TeamService } from "./team.service.js";

function mockTeamRepo(): TeamRepository {
	const teams = new Map<string, Team>();
	const members = new Map<string, TeamMember[]>();
	let projectsExist = false;

	return {
		create: vi.fn((team: Team) => { teams.set(team.id, team); }),
		findById: vi.fn((id: string) => teams.get(id) ?? null),
		findByName: vi.fn((name: string) => {
			for (const t of teams.values()) {
				if (t.name.toLowerCase() === name.toLowerCase()) return t;
			}
			return null;
		}),
		listByUser: vi.fn(() => [...teams.values()]),
		delete: vi.fn((id: string) => { teams.delete(id); }),
		hasProjects: vi.fn(() => projectsExist),
		addMember: vi.fn((teamId: string, userId: string, role: TeamRole) => {
			const list = members.get(teamId) ?? [];
			list.push({ teamId, userId, role, createdAt: "" });
			members.set(teamId, list);
		}),
		removeMember: vi.fn(),
		updateMemberRole: vi.fn(),
		getMembership: vi.fn((userId: string, teamName: string) => {
			for (const [tid, list] of members.entries()) {
				const team = teams.get(tid);
				if (team?.name.toLowerCase() === teamName.toLowerCase()) {
					const m = list.find((m) => m.userId === userId);
					if (m) return { teamId: tid, role: m.role };
				}
			}
			return null;
		}),
		listMembers: vi.fn((teamId: string) => members.get(teamId) ?? []),
		// expose for test manipulation
		_setHasProjects: (v: boolean) => { projectsExist = v; },
	} as TeamRepository & { _setHasProjects: (v: boolean) => void };
}

describe("TeamService", () => {
	let service: TeamService;
	let repo: ReturnType<typeof mockTeamRepo>;

	beforeEach(() => {
		repo = mockTeamRepo();
		service = new TeamService(repo);
	});

	it("create builds and stores team", () => {
		const team = service.create("acme");
		expect(team.name).toBe("acme");
		expect(repo.create).toHaveBeenCalled();
	});

	it("create throws on duplicate name", () => {
		service.create("acme");
		expect(() => service.create("acme")).toThrow("already exists");
	});

	it("delete removes team", () => {
		const team = service.create("acme");
		service.delete(team.id);
		expect(repo.delete).toHaveBeenCalledWith(team.id);
	});

	it("delete throws when team has projects", () => {
		const team = service.create("acme");
		repo._setHasProjects(true);
		expect(() => service.delete(team.id)).toThrow("Cannot delete");
	});

	it("listByUser delegates to repo", () => {
		service.listByUser("u-1");
		expect(repo.listByUser).toHaveBeenCalledWith("u-1");
	});

	it("addMember delegates to repo", () => {
		service.create("acme");
		service.addMember("t-1", "u-1", "admin");
		expect(repo.addMember).toHaveBeenCalled();
	});

	it("removeMember delegates to repo", () => {
		service.removeMember("t-1", "u-1");
		expect(repo.removeMember).toHaveBeenCalledWith("t-1", "u-1");
	});

	it("updateMemberRole delegates to repo", () => {
		service.updateMemberRole("t-1", "u-1", "admin");
		expect(repo.updateMemberRole).toHaveBeenCalledWith("t-1", "u-1", "admin");
	});

	it("getMembership delegates to repo", () => {
		service.getMembership("u-1", "acme");
		expect(repo.getMembership).toHaveBeenCalledWith("u-1", "acme");
	});
});
```

- [ ] **Step 2: Run tests — expect fail**

Run: `npm run test -w packages/server -- --reporter verbose`

- [ ] **Step 3: Implement TeamService**

```typescript
import type { Team, TeamMember, TeamRole } from "@logd/shared";
import { buildTeam } from "../domain/team.js";
import type { TeamRepository } from "../ports/team.repository.js";
import { ConflictError } from "./project.service.js";

export class TeamService {
	constructor(private repo: TeamRepository) {}

	create(name: string): Team {
		if (this.repo.findByName(name)) {
			throw new ConflictError(`Team '${name}' already exists`);
		}
		const team = buildTeam(name);
		this.repo.create(team);
		return team;
	}

	delete(teamId: string): void {
		if (this.repo.hasProjects(teamId)) {
			throw new BadRequestError("Cannot delete team with existing projects");
		}
		this.repo.delete(teamId);
	}

	listByUser(userId: string): Team[] {
		return this.repo.listByUser(userId);
	}

	addMember(teamId: string, userId: string, role: TeamRole): void {
		this.repo.addMember(teamId, userId, role);
	}

	removeMember(teamId: string, userId: string): void {
		this.repo.removeMember(teamId, userId);
	}

	updateMemberRole(teamId: string, userId: string, role: TeamRole): void {
		this.repo.updateMemberRole(teamId, userId, role);
	}

	getMembership(userId: string, teamName: string): { teamId: string; role: TeamRole } | null {
		return this.repo.getMembership(userId, teamName);
	}

	listMembers(teamId: string): TeamMember[] {
		return this.repo.listMembers(teamId);
	}
}

export class BadRequestError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "BadRequestError";
	}
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npm run test -w packages/server -- --reporter verbose`

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/application/team.service.ts packages/server/src/application/team.service.test.ts
git commit -m "feat(server): team service — CRUD, membership management"
```

---

### Task 10: User service

**Files:**
- Create: `packages/server/src/application/user.service.ts`
- Create: `packages/server/src/application/user.service.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { User, Token } from "@logd/shared";
import type { UserRepository } from "../ports/user.repository.js";
import type { TokenService } from "./token.service.js";
import { UserService } from "./user.service.js";

function mockUserRepo(): UserRepository {
	const store = new Map<string, User>();
	return {
		create: vi.fn((user: User) => { store.set(user.id, user); }),
		findById: vi.fn((id: string) => store.get(id) ?? null),
		findByEmail: vi.fn((email: string) => {
			for (const u of store.values()) {
				if (u.email.toLowerCase() === email.toLowerCase()) return u;
			}
			return null;
		}),
		listByTeam: vi.fn(() => [...store.values()]),
		isEmpty: vi.fn(() => store.size === 0),
	};
}

function mockTokenService(): Pick<TokenService, "create"> {
	return {
		create: vi.fn(() => ({
			raw: "raw-token-abc",
			token: { id: "tk-1", userId: "u-1", name: "initial", createdAt: "", lastUsedAt: null },
		})),
	};
}

describe("UserService", () => {
	let service: UserService;
	let repo: ReturnType<typeof mockUserRepo>;
	let tokenSvc: ReturnType<typeof mockTokenService>;

	beforeEach(() => {
		repo = mockUserRepo();
		tokenSvc = mockTokenService();
		service = new UserService(repo, tokenSvc as any);
	});

	it("create returns user + raw token", () => {
		const result = service.create("tony@example.com", "Tony");
		expect(result.user.email).toBe("tony@example.com");
		expect(result.rawToken).toBe("raw-token-abc");
		expect(repo.create).toHaveBeenCalled();
		expect(tokenSvc.create).toHaveBeenCalled();
	});

	it("create throws on duplicate email", () => {
		service.create("tony@example.com", "Tony");
		expect(() => service.create("tony@example.com", "Tony 2")).toThrow("already exists");
	});

	it("listByTeam delegates to repo", () => {
		service.listByTeam("t-1");
		expect(repo.listByTeam).toHaveBeenCalledWith("t-1");
	});
});
```

- [ ] **Step 2: Run tests — expect fail**

Run: `npm run test -w packages/server -- --reporter verbose`

- [ ] **Step 3: Implement UserService**

```typescript
import type { User } from "@logd/shared";
import { buildUser } from "../domain/user.js";
import type { UserRepository } from "../ports/user.repository.js";
import { ConflictError } from "./project.service.js";
import type { TokenService } from "./token.service.js";

export class UserService {
	constructor(
		private repo: UserRepository,
		private tokenService: TokenService,
	) {}

	create(email: string, name: string): { user: User; rawToken: string } {
		if (this.repo.findByEmail(email)) {
			throw new ConflictError(`User with email '${email}' already exists`);
		}
		const user = buildUser(email, name);
		this.repo.create(user);
		const { raw } = this.tokenService.create(user.id, "initial");
		return { user, rawToken: raw };
	}

	listByTeam(teamId: string): User[] {
		return this.repo.listByTeam(teamId);
	}
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npm run test -w packages/server -- --reporter verbose`

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/application/user.service.ts packages/server/src/application/user.service.test.ts
git commit -m "feat(server): user service — create with initial token"
```

---

### Task 11: Bootstrap seed logic

**Files:**
- Create: `packages/server/src/application/bootstrap.ts`
- Create: `packages/server/src/application/bootstrap.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import type Database from "better-sqlite3";
import { createInMemoryDatabase } from "../adapters/persistence/database.js";
import { SqliteUserRepo } from "../adapters/persistence/sqlite.user.repo.js";
import { SqliteTeamRepo } from "../adapters/persistence/sqlite.team.repo.js";
import { SqliteTokenRepo } from "../adapters/persistence/sqlite.token.repo.js";
import { TokenService } from "./token.service.js";
import { bootstrap } from "./bootstrap.js";
import { hashToken } from "../domain/token.js";

describe("bootstrap", () => {
	let db: Database.Database;
	let userRepo: SqliteUserRepo;
	let teamRepo: SqliteTeamRepo;
	let tokenRepo: SqliteTokenRepo;
	let tokenService: TokenService;

	beforeEach(() => {
		db = createInMemoryDatabase();
		userRepo = new SqliteUserRepo(db);
		teamRepo = new SqliteTeamRepo(db);
		tokenRepo = new SqliteTokenRepo(db);
		tokenService = new TokenService(tokenRepo);
	});

	it("seeds admin user + default team on empty DB", () => {
		bootstrap({ db, userRepo, teamRepo, tokenService, apiToken: "my-secret" });

		expect(userRepo.isEmpty()).toBe(false);
		const admin = userRepo.findByEmail("admin@localhost");
		expect(admin).not.toBeNull();

		const team = teamRepo.findByName("default");
		expect(team).not.toBeNull();

		const membership = teamRepo.getMembership(admin!.id, "default");
		expect(membership?.role).toBe("admin");

		// Token should be hash of "my-secret"
		const tokenResult = tokenRepo.findByHash(hashToken("my-secret"));
		expect(tokenResult).not.toBeNull();
	});

	it("assigns existing teamless projects to default team", () => {
		// Create a project without team_id before bootstrap
		db.exec(
			"INSERT INTO projects (id, name, created_at) VALUES ('p-1', 'old-proj', '2026-01-01')",
		);

		bootstrap({ db, userRepo, teamRepo, tokenService, apiToken: "my-secret" });

		const row = db.prepare("SELECT team_id FROM projects WHERE id = 'p-1'").get() as { team_id: string };
		const team = teamRepo.findByName("default");
		expect(row.team_id).toBe(team!.id);
	});

	it("skips seed when users table is not empty", () => {
		// Seed first time
		bootstrap({ db, userRepo, teamRepo, tokenService, apiToken: "secret1" });
		const userCount1 = db.prepare("SELECT COUNT(*) as c FROM users").get() as { c: number };

		// Try again — should be no-op
		bootstrap({ db, userRepo, teamRepo, tokenService, apiToken: "secret2" });
		const userCount2 = db.prepare("SELECT COUNT(*) as c FROM users").get() as { c: number };

		expect(userCount1.c).toBe(userCount2.c);
	});

	it("skips seed when no apiToken provided", () => {
		bootstrap({ db, userRepo, teamRepo, tokenService, apiToken: undefined });
		expect(userRepo.isEmpty()).toBe(true);
	});
});
```

- [ ] **Step 2: Run tests — expect fail**

Run: `npm run test -w packages/server -- --reporter verbose`

- [ ] **Step 3: Implement bootstrap**

```typescript
import type Database from "better-sqlite3";
import { buildTeam } from "../domain/team.js";
import { buildUser } from "../domain/user.js";
import type { SqliteTeamRepo } from "../adapters/persistence/sqlite.team.repo.js";
import type { SqliteUserRepo } from "../adapters/persistence/sqlite.user.repo.js";
import type { TokenService } from "./token.service.js";

export interface BootstrapDeps {
	db: Database.Database;
	userRepo: SqliteUserRepo;
	teamRepo: SqliteTeamRepo;
	tokenService: TokenService;
	apiToken: string | undefined;
}

export function bootstrap(deps: BootstrapDeps): void {
	const { db, userRepo, teamRepo, tokenService, apiToken } = deps;

	if (!userRepo.isEmpty() || !apiToken) return;

	const admin = buildUser("admin@localhost", "Admin");
	userRepo.create(admin);

	const team = buildTeam("default");
	teamRepo.create(team);

	teamRepo.addMember(team.id, admin.id, "admin");

	tokenService.createWithRaw(admin.id, "bootstrap", apiToken);

	// Assign existing teamless projects to default team
	db.prepare("UPDATE projects SET team_id = ? WHERE team_id IS NULL").run(team.id);
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npm run test -w packages/server -- --reporter verbose`

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/application/bootstrap.ts packages/server/src/application/bootstrap.test.ts
git commit -m "feat(server): bootstrap seed — admin user, default team, token"
```

---

### Task 12: Auth middleware rewrite (bearerAuth + team check)

**Files:**
- Rewrite: `packages/server/src/adapters/http/middleware/auth.ts`
- Rewrite: `packages/server/src/adapters/http/middleware/auth.test.ts`
- Create: `packages/server/src/adapters/http/middleware/team.ts`
- Create: `packages/server/src/adapters/http/middleware/team.test.ts`

- [ ] **Step 1: Write auth middleware tests**

```typescript
import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";
import { createAuthMiddleware } from "./auth.js";
import type { TokenService } from "../../../application/token.service.js";

function mockTokenService(valid = true): Pick<TokenService, "authenticate" | "touch"> {
	return {
		authenticate: vi.fn(() => (valid ? { id: "u-1" } : null)),
		touch: vi.fn(),
	};
}

function makeApp(tokenSvc: Pick<TokenService, "authenticate" | "touch">) {
	const app = new Hono();
	app.use("*", createAuthMiddleware(tokenSvc as any));
	app.get("/test", (c) => c.json({ userId: c.get("userId") }));
	return app;
}

describe("auth middleware (bearerAuth)", () => {
	it("returns 401 when no Authorization header", async () => {
		const app = makeApp(mockTokenService());
		const res = await app.request("/test");
		expect(res.status).toBe(401);
	});

	it("returns 401 when token is invalid", async () => {
		const app = makeApp(mockTokenService(false));
		const res = await app.request("/test", {
			headers: { Authorization: "Bearer badtoken" },
		});
		expect(res.status).toBe(401);
	});

	it("sets userId on valid token", async () => {
		const app = makeApp(mockTokenService());
		const res = await app.request("/test", {
			headers: { Authorization: "Bearer goodtoken" },
		});
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.userId).toBe("u-1");
	});

	it("calls touch on valid token", async () => {
		const svc = mockTokenService();
		const app = makeApp(svc);
		await app.request("/test", {
			headers: { Authorization: "Bearer goodtoken" },
		});
		expect(svc.touch).toHaveBeenCalledWith("goodtoken");
	});
});
```

- [ ] **Step 2: Write team middleware tests**

```typescript
import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";
import { teamMiddleware } from "./team.js";
import type { TeamService } from "../../../application/team.service.js";
import type { AppEnv } from "../app.js";

function mockTeamService(membership: { teamId: string; role: "admin" | "member" } | null) {
	return {
		getMembership: vi.fn(() => membership),
	} as Pick<TeamService, "getMembership">;
}

function makeApp(teamSvc: Pick<TeamService, "getMembership">) {
	const app = new Hono<AppEnv>();
	// Simulate auth middleware already ran
	app.use("*", async (c, next) => {
		c.set("userId", "u-1");
		await next();
	});
	app.use("*", teamMiddleware(teamSvc as any));
	app.get("/test", (c) => c.json({ teamId: c.get("teamId"), role: c.get("role") }));
	return app;
}

describe("team middleware", () => {
	it("returns 401 when X-Team header is missing", async () => {
		const app = makeApp(mockTeamService({ teamId: "t-1", role: "admin" }));
		const res = await app.request("/test");
		expect(res.status).toBe(401);
		expect(await res.text()).toContain("X-Team header is required");
	});

	it("returns 403 when user is not a member", async () => {
		const app = makeApp(mockTeamService(null));
		const res = await app.request("/test", {
			headers: { "X-Team": "acme" },
		});
		expect(res.status).toBe(403);
		expect(await res.text()).toContain("not a member");
	});

	it("sets teamId and role on valid membership", async () => {
		const app = makeApp(mockTeamService({ teamId: "t-1", role: "admin" }));
		const res = await app.request("/test", {
			headers: { "X-Team": "acme" },
		});
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.teamId).toBe("t-1");
		expect(body.role).toBe("admin");
	});
});
```

- [ ] **Step 3: Run tests — expect fail**

Run: `npm run test -w packages/server -- --reporter verbose`

- [ ] **Step 4: Implement auth middleware**

Rewrite `packages/server/src/adapters/http/middleware/auth.ts`:

```typescript
import { bearerAuth } from "hono/bearer-auth";
import type { MiddlewareHandler } from "hono";
import type { TokenService } from "../../../application/token.service.js";
import type { AppEnv } from "../app.js";

export function createAuthMiddleware(
	tokenService: TokenService,
): MiddlewareHandler<AppEnv> {
	return bearerAuth({
		verifyToken: async (token, c) => {
			const result = tokenService.authenticate(token);
			if (!result) return false;
			c.set("userId", result.id);
			tokenService.touch(token);
			return true;
		},
	});
}
```

- [ ] **Step 5: Implement team middleware**

Create `packages/server/src/adapters/http/middleware/team.ts`:

```typescript
import type { MiddlewareHandler } from "hono";
import type { TeamService } from "../../../application/team.service.js";
import type { AppEnv } from "../app.js";

export function teamMiddleware(
	teamService: TeamService,
): MiddlewareHandler<AppEnv> {
	return async (c, next) => {
		const teamName = c.req.header("X-Team");
		if (!teamName) {
			return c.text("X-Team header is required", 401);
		}

		const userId = c.get("userId");
		const membership = teamService.getMembership(userId, teamName);
		if (!membership) {
			return c.text("Access denied: not a member of this team.", 403);
		}

		c.set("teamId", membership.teamId);
		c.set("role", membership.role);
		await next();
	};
}
```

- [ ] **Step 6: Run tests — expect pass**

Run: `npm run test -w packages/server -- --reporter verbose`

Note: The tests may fail until `AppEnv` type is defined. Create a temporary stub or update `app.ts` with the type first. If tests need `AppEnv`, add this export to `app.ts`:

```typescript
export type AppEnv = {
	Variables: {
		userId: string;
		teamId: string;
		role: "admin" | "member";
	};
};
```

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/adapters/http/middleware/auth.ts packages/server/src/adapters/http/middleware/auth.test.ts packages/server/src/adapters/http/middleware/team.ts packages/server/src/adapters/http/middleware/team.test.ts packages/server/src/adapters/http/app.ts
git commit -m "feat(server): auth middleware rewrite — bearerAuth + team check"
```

---

### Task 13: Role guard middleware

**Files:**
- Create: `packages/server/src/adapters/http/middleware/role.ts`
- Create: `packages/server/src/adapters/http/middleware/role.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { adminOnly } from "./role.js";
import type { AppEnv } from "../app.js";

function makeApp(role: "admin" | "member") {
	const app = new Hono<AppEnv>();
	app.use("*", async (c, next) => {
		c.set("userId", "u-1");
		c.set("teamId", "t-1");
		c.set("role", role);
		await next();
	});
	app.get("/admin", adminOnly(), (c) => c.text("ok"));
	return app;
}

describe("adminOnly middleware", () => {
	it("passes for admin", async () => {
		const app = makeApp("admin");
		const res = await app.request("/admin");
		expect(res.status).toBe(200);
	});

	it("returns 403 for member", async () => {
		const app = makeApp("member");
		const res = await app.request("/admin");
		expect(res.status).toBe(403);
		expect(await res.text()).toContain("Admin access required");
	});
});
```

- [ ] **Step 2: Run tests — expect fail**

- [ ] **Step 3: Implement role middleware**

```typescript
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../app.js";

export function adminOnly(): MiddlewareHandler<AppEnv> {
	return async (c, next) => {
		if (c.get("role") !== "admin") {
			return c.text("Admin access required", 403);
		}
		await next();
	};
}
```

- [ ] **Step 4: Run tests — expect pass**

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/adapters/http/middleware/role.ts packages/server/src/adapters/http/middleware/role.test.ts
git commit -m "feat(server): admin-only role guard middleware"
```

---

### Task 14: Team routes

**Files:**
- Create: `packages/server/src/adapters/http/routes/teams.ts`
- Create: `packages/server/src/adapters/http/routes/teams.test.ts`

- [ ] **Step 1: Write failing tests**

Tests should use a full integration setup: in-memory DB, real repos, bootstrap an admin, then test team CRUD + membership endpoints. Tests need the full middleware pipeline (auth + team + role).

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../app.js";
import { createInMemoryDatabase } from "../../persistence/database.js";
import { SqliteUserRepo } from "../../persistence/sqlite.user.repo.js";
import { SqliteTeamRepo } from "../../persistence/sqlite.team.repo.js";
import { SqliteTokenRepo } from "../../persistence/sqlite.token.repo.js";
import { TokenService } from "../../../application/token.service.js";
import { TeamService } from "../../../application/team.service.js";
import { UserService } from "../../../application/user.service.js";
import { bootstrap } from "../../../application/bootstrap.js";
import { createAuthMiddleware } from "../middleware/auth.js";
import { teamMiddleware } from "../middleware/team.js";
import { teamRoutes } from "./teams.js";

const API_TOKEN = "test-admin-token";

function setup() {
	const db = createInMemoryDatabase();
	const userRepo = new SqliteUserRepo(db);
	const teamRepo = new SqliteTeamRepo(db);
	const tokenRepo = new SqliteTokenRepo(db);
	const tokenService = new TokenService(tokenRepo);
	const teamService = new TeamService(teamRepo);
	const userService = new UserService(userRepo, tokenService);

	bootstrap({ db, userRepo, teamRepo, tokenService, apiToken: API_TOKEN });

	const app = new Hono<AppEnv>();
	app.use("*", createAuthMiddleware(tokenService));
	app.use("*", teamMiddleware(teamService));
	app.route("/teams", teamRoutes(teamService));
	return { app, db, teamRepo };
}

const headers = {
	Authorization: `Bearer ${API_TOKEN}`,
	"X-Team": "default",
	"Content-Type": "application/json",
};

describe("team routes", () => {
	it("POST /teams creates team — 201", async () => {
		const { app } = setup();
		const res = await app.request("/teams", {
			method: "POST",
			headers,
			body: JSON.stringify({ name: "new-team" }),
		});
		expect(res.status).toBe(201);
		const body = await res.json();
		expect(body.name).toBe("new-team");
	});

	it("POST /teams returns 400 when name missing", async () => {
		const { app } = setup();
		const res = await app.request("/teams", {
			method: "POST",
			headers,
			body: JSON.stringify({}),
		});
		expect(res.status).toBe(400);
	});

	it("POST /teams returns 409 on duplicate", async () => {
		const { app } = setup();
		await app.request("/teams", {
			method: "POST",
			headers,
			body: JSON.stringify({ name: "dup" }),
		});
		const res = await app.request("/teams", {
			method: "POST",
			headers,
			body: JSON.stringify({ name: "dup" }),
		});
		expect(res.status).toBe(409);
	});

	it("GET /teams lists user's teams", async () => {
		const { app } = setup();
		const res = await app.request("/teams", { headers });
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.length).toBeGreaterThanOrEqual(1);
	});

	it("DELETE /teams/:id deletes team — 204", async () => {
		const { app, teamRepo } = setup();
		const createRes = await app.request("/teams", {
			method: "POST",
			headers,
			body: JSON.stringify({ name: "to-delete" }),
		});
		const { id } = await createRes.json();
		const res = await app.request(`/teams/${id}`, {
			method: "DELETE",
			headers,
		});
		expect(res.status).toBe(204);
	});

	it("POST /teams/:id/members adds member — 201", async () => {
		const { app, db } = setup();
		// Create another user directly
		db.exec(
			"INSERT INTO users (id, email, name, created_at) VALUES ('u-2', 'other@test.com', 'Other', '2026-01-01')",
		);
		const team = db.prepare("SELECT id FROM teams WHERE name = 'default'").get() as { id: string };
		const res = await app.request(`/teams/${team.id}/members`, {
			method: "POST",
			headers,
			body: JSON.stringify({ userId: "u-2", role: "member" }),
		});
		expect(res.status).toBe(201);
	});

	it("DELETE /teams/:id/members/:userId removes member — 204", async () => {
		const { app, db } = setup();
		db.exec(
			"INSERT INTO users (id, email, name, created_at) VALUES ('u-2', 'other@test.com', 'Other', '2026-01-01')",
		);
		const team = db.prepare("SELECT id FROM teams WHERE name = 'default'").get() as { id: string };
		await app.request(`/teams/${team.id}/members`, {
			method: "POST",
			headers,
			body: JSON.stringify({ userId: "u-2", role: "member" }),
		});
		const res = await app.request(`/teams/${team.id}/members/u-2`, {
			method: "DELETE",
			headers,
		});
		expect(res.status).toBe(204);
	});

	it("PATCH /teams/:id/members/:userId changes role — 204", async () => {
		const { app, db } = setup();
		db.exec(
			"INSERT INTO users (id, email, name, created_at) VALUES ('u-2', 'other@test.com', 'Other', '2026-01-01')",
		);
		const team = db.prepare("SELECT id FROM teams WHERE name = 'default'").get() as { id: string };
		await app.request(`/teams/${team.id}/members`, {
			method: "POST",
			headers,
			body: JSON.stringify({ userId: "u-2", role: "member" }),
		});
		const res = await app.request(`/teams/${team.id}/members/u-2`, {
			method: "PATCH",
			headers,
			body: JSON.stringify({ role: "admin" }),
		});
		expect(res.status).toBe(204);
	});
});
```

- [ ] **Step 2: Run tests — expect fail**

- [ ] **Step 3: Implement team routes**

```typescript
import { Hono } from "hono";
import type { AppEnv } from "../app.js";
import type { TeamService } from "../../../application/team.service.js";
import { BadRequestError } from "../../../application/team.service.js";
import { ConflictError } from "../../../application/project.service.js";
import { adminOnly } from "../middleware/role.js";

export function teamRoutes(teamService: TeamService): Hono<AppEnv> {
	const router = new Hono<AppEnv>();

	router.post("/", adminOnly(), async (c) => {
		const body = await c.req.json();
		if (!body.name) return c.text("name is required", 400);
		try {
			const team = teamService.create(body.name);
			return c.json(team, 201);
		} catch (e) {
			if (e instanceof ConflictError) return c.text(e.message, 409);
			throw e;
		}
	});

	router.get("/", (c) => {
		const teams = teamService.listByUser(c.get("userId"));
		return c.json(teams, 200);
	});

	router.delete("/:id", adminOnly(), (c) => {
		try {
			teamService.delete(c.req.param("id"));
			return c.body(null, 204);
		} catch (e) {
			if (e instanceof BadRequestError) return c.text(e.message, 400);
			throw e;
		}
	});

	router.post("/:id/members", adminOnly(), async (c) => {
		const body = await c.req.json();
		if (!body.userId) return c.text("userId is required", 400);
		if (!body.role) return c.text("role is required", 400);
		teamService.addMember(c.req.param("id"), body.userId, body.role);
		return c.body(null, 201);
	});

	router.delete("/:id/members/:userId", adminOnly(), (c) => {
		teamService.removeMember(c.req.param("id"), c.req.param("userId"));
		return c.body(null, 204);
	});

	router.patch("/:id/members/:userId", adminOnly(), async (c) => {
		const body = await c.req.json();
		if (!body.role) return c.text("role is required", 400);
		teamService.updateMemberRole(c.req.param("id"), c.req.param("userId"), body.role);
		return c.body(null, 204);
	});

	return router;
}
```

- [ ] **Step 4: Run tests — expect pass**

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/adapters/http/routes/teams.ts packages/server/src/adapters/http/routes/teams.test.ts
git commit -m "feat(server): team routes — CRUD, membership management"
```

---

### Task 15: User routes

**Files:**
- Create: `packages/server/src/adapters/http/routes/users.ts`
- Create: `packages/server/src/adapters/http/routes/users.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../app.js";
import { createInMemoryDatabase } from "../../persistence/database.js";
import { SqliteUserRepo } from "../../persistence/sqlite.user.repo.js";
import { SqliteTeamRepo } from "../../persistence/sqlite.team.repo.js";
import { SqliteTokenRepo } from "../../persistence/sqlite.token.repo.js";
import { TokenService } from "../../../application/token.service.js";
import { TeamService } from "../../../application/team.service.js";
import { UserService } from "../../../application/user.service.js";
import { bootstrap } from "../../../application/bootstrap.js";
import { createAuthMiddleware } from "../middleware/auth.js";
import { teamMiddleware } from "../middleware/team.js";
import { userRoutes } from "./users.js";

const API_TOKEN = "test-admin-token";

function setup() {
	const db = createInMemoryDatabase();
	const userRepo = new SqliteUserRepo(db);
	const teamRepo = new SqliteTeamRepo(db);
	const tokenRepo = new SqliteTokenRepo(db);
	const tokenService = new TokenService(tokenRepo);
	const teamService = new TeamService(teamRepo);
	const userService = new UserService(userRepo, tokenService);

	bootstrap({ db, userRepo, teamRepo, tokenService, apiToken: API_TOKEN });

	const app = new Hono<AppEnv>();
	app.use("*", createAuthMiddleware(tokenService));
	app.use("*", teamMiddleware(teamService));
	app.route("/users", userRoutes(userService));
	return app;
}

const headers = {
	Authorization: `Bearer ${API_TOKEN}`,
	"X-Team": "default",
	"Content-Type": "application/json",
};

describe("user routes", () => {
	it("POST /users creates user and returns token — 201", async () => {
		const app = setup();
		const res = await app.request("/users", {
			method: "POST",
			headers,
			body: JSON.stringify({ email: "new@test.com", name: "New User" }),
		});
		expect(res.status).toBe(201);
		const body = await res.json();
		expect(body.user.email).toBe("new@test.com");
		expect(body.token).toHaveLength(64);
	});

	it("POST /users returns 400 when email missing", async () => {
		const app = setup();
		const res = await app.request("/users", {
			method: "POST",
			headers,
			body: JSON.stringify({ name: "No Email" }),
		});
		expect(res.status).toBe(400);
	});

	it("POST /users returns 409 on duplicate email", async () => {
		const app = setup();
		await app.request("/users", {
			method: "POST",
			headers,
			body: JSON.stringify({ email: "dup@test.com", name: "Dup" }),
		});
		const res = await app.request("/users", {
			method: "POST",
			headers,
			body: JSON.stringify({ email: "dup@test.com", name: "Dup 2" }),
		});
		expect(res.status).toBe(409);
	});

	it("GET /users lists users in current team", async () => {
		const app = setup();
		const res = await app.request("/users", { headers });
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.length).toBeGreaterThanOrEqual(1);
	});
});
```

- [ ] **Step 2: Run tests — expect fail**

- [ ] **Step 3: Implement user routes**

```typescript
import { Hono } from "hono";
import type { AppEnv } from "../app.js";
import type { UserService } from "../../../application/user.service.js";
import { ConflictError } from "../../../application/project.service.js";
import { adminOnly } from "../middleware/role.js";

export function userRoutes(userService: UserService): Hono<AppEnv> {
	const router = new Hono<AppEnv>();

	router.post("/", adminOnly(), async (c) => {
		const body = await c.req.json();
		if (!body.email) return c.text("email is required", 400);
		if (!body.name) return c.text("name is required", 400);
		try {
			const { user, rawToken } = userService.create(body.email, body.name);
			return c.json({ user, token: rawToken }, 201);
		} catch (e) {
			if (e instanceof ConflictError) return c.text(e.message, 409);
			throw e;
		}
	});

	router.get("/", (c) => {
		const users = userService.listByTeam(c.get("teamId"));
		return c.json(users, 200);
	});

	return router;
}
```

- [ ] **Step 4: Run tests — expect pass**

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/adapters/http/routes/users.ts packages/server/src/adapters/http/routes/users.test.ts
git commit -m "feat(server): user routes — create with token, list by team"
```

---

### Task 16: Token routes

**Files:**
- Create: `packages/server/src/adapters/http/routes/tokens.ts`
- Create: `packages/server/src/adapters/http/routes/tokens.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../app.js";
import { createInMemoryDatabase } from "../../persistence/database.js";
import { SqliteUserRepo } from "../../persistence/sqlite.user.repo.js";
import { SqliteTeamRepo } from "../../persistence/sqlite.team.repo.js";
import { SqliteTokenRepo } from "../../persistence/sqlite.token.repo.js";
import { TokenService } from "../../../application/token.service.js";
import { TeamService } from "../../../application/team.service.js";
import { bootstrap } from "../../../application/bootstrap.js";
import { createAuthMiddleware } from "../middleware/auth.js";
import { teamMiddleware } from "../middleware/team.js";
import { tokenRoutes } from "./tokens.js";

const API_TOKEN = "test-admin-token";

function setup() {
	const db = createInMemoryDatabase();
	const userRepo = new SqliteUserRepo(db);
	const teamRepo = new SqliteTeamRepo(db);
	const tokenRepo = new SqliteTokenRepo(db);
	const tokenService = new TokenService(tokenRepo);
	const teamService = new TeamService(teamRepo);

	bootstrap({ db, userRepo, teamRepo, tokenService, apiToken: API_TOKEN });

	const app = new Hono<AppEnv>();
	app.use("*", createAuthMiddleware(tokenService));
	app.use("*", teamMiddleware(teamService));
	app.route("/tokens", tokenRoutes(tokenService));
	return app;
}

const headers = {
	Authorization: `Bearer ${API_TOKEN}`,
	"X-Team": "default",
	"Content-Type": "application/json",
};

describe("token routes", () => {
	it("POST /tokens creates token — 201", async () => {
		const app = setup();
		const res = await app.request("/tokens", {
			method: "POST",
			headers,
			body: JSON.stringify({ name: "ci-token" }),
		});
		expect(res.status).toBe(201);
		const body = await res.json();
		expect(body.token).toHaveLength(64);
	});

	it("POST /tokens returns 400 when name missing", async () => {
		const app = setup();
		const res = await app.request("/tokens", {
			method: "POST",
			headers,
			body: JSON.stringify({}),
		});
		expect(res.status).toBe(400);
	});

	it("GET /tokens lists tokens (no raw values)", async () => {
		const app = setup();
		const res = await app.request("/tokens", { headers });
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.length).toBeGreaterThanOrEqual(1);
		// Should not contain raw token values
		for (const t of body) {
			expect(t).not.toHaveProperty("tokenHash");
			expect(t).not.toHaveProperty("token_hash");
		}
	});

	it("DELETE /tokens/:id revokes token — 204", async () => {
		const app = setup();
		const createRes = await app.request("/tokens", {
			method: "POST",
			headers,
			body: JSON.stringify({ name: "temp" }),
		});
		const { token: _ } = await createRes.json();
		// Get list to find the new token ID
		const listRes = await app.request("/tokens", { headers });
		const tokens = await listRes.json();
		const newToken = tokens.find((t: any) => t.name === "temp");

		const res = await app.request(`/tokens/${newToken.id}`, {
			method: "DELETE",
			headers,
		});
		expect(res.status).toBe(204);
	});
});
```

- [ ] **Step 2: Run tests — expect fail**

- [ ] **Step 3: Implement token routes**

```typescript
import { Hono } from "hono";
import type { AppEnv } from "../app.js";
import type { TokenService } from "../../../application/token.service.js";

export function tokenRoutes(tokenService: TokenService): Hono<AppEnv> {
	const router = new Hono<AppEnv>();

	router.post("/", async (c) => {
		const body = await c.req.json();
		if (!body.name) return c.text("name is required", 400);
		const { raw } = tokenService.create(c.get("userId"), body.name);
		return c.json({ token: raw }, 201);
	});

	router.get("/", (c) => {
		const tokens = tokenService.list(c.get("userId"));
		return c.json(tokens, 200);
	});

	router.delete("/:id", (c) => {
		tokenService.revoke(c.req.param("id"));
		return c.body(null, 204);
	});

	return router;
}
```

- [ ] **Step 4: Run tests — expect pass**

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/adapters/http/routes/tokens.ts packages/server/src/adapters/http/routes/tokens.test.ts
git commit -m "feat(server): token routes — create, list, revoke"
```

---

### Task 17: Add team scoping to project repository + service

**Files:**
- Modify: `packages/server/src/ports/project.repository.ts`
- Modify: `packages/server/src/adapters/persistence/sqlite.project.repo.ts`
- Modify: `packages/server/src/adapters/persistence/sqlite.project.repo.test.ts`
- Modify: `packages/server/src/application/project.service.ts`
- Modify: `packages/server/src/application/project.service.test.ts`

- [ ] **Step 1: Update ProjectRepository port**

```typescript
export interface ProjectRepository {
	create(name: string, description: string | null, teamId: string): void;
	findByName(name: string, teamId: string): boolean;
}
```

- [ ] **Step 2: Update SqliteProjectRepo**

```typescript
import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { ProjectRepository } from "../../ports/project.repository.js";

export class SqliteProjectRepo implements ProjectRepository {
	constructor(private db: Database.Database) {}

	create(name: string, description: string | null, teamId: string): void {
		this.db
			.prepare(
				"INSERT INTO projects (id, name, description, team_id, created_at) VALUES (?, ?, ?, ?, ?)",
			)
			.run(randomUUID(), name, description, teamId, new Date().toISOString());
	}

	findByName(name: string, teamId: string): boolean {
		const row = this.db
			.prepare("SELECT 1 FROM projects WHERE LOWER(name) = LOWER(?) AND team_id = ?")
			.get(name.trim(), teamId);
		return row !== undefined;
	}
}
```

- [ ] **Step 3: Update project repo tests**

Update tests to pass `teamId` and seed a team in `beforeEach`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import type Database from "better-sqlite3";
import { createInMemoryDatabase } from "./database.js";
import { SqliteProjectRepo } from "./sqlite.project.repo.js";

describe("SqliteProjectRepo", () => {
	let db: Database.Database;
	let repo: SqliteProjectRepo;

	beforeEach(() => {
		db = createInMemoryDatabase();
		db.exec("INSERT INTO teams (id, name, created_at) VALUES ('t-1', 'acme', '2026-01-01')");
		repo = new SqliteProjectRepo(db);
	});

	it("creates a project and findByName returns true", () => {
		repo.create("test-project", "desc", "t-1");
		expect(repo.findByName("test-project", "t-1")).toBe(true);
	});

	it("findByName returns false for unknown project", () => {
		expect(repo.findByName("nope", "t-1")).toBe(false);
	});

	it("findByName is case-insensitive", () => {
		repo.create("MyProject", null, "t-1");
		expect(repo.findByName("myproject", "t-1")).toBe(true);
	});

	it("findByName scoped to team", () => {
		repo.create("proj", null, "t-1");
		db.exec("INSERT INTO teams (id, name, created_at) VALUES ('t-2', 'other', '2026-01-01')");
		expect(repo.findByName("proj", "t-2")).toBe(false);
	});

	it("throws on duplicate project name", () => {
		repo.create("dup", null, "t-1");
		expect(() => repo.create("dup", null, "t-1")).toThrow();
	});
});
```

Note: The duplicate check is currently on the UNIQUE constraint on `name` globally. With team scoping, two teams can have the same project name. You may need to change the DB schema from `name TEXT NOT NULL UNIQUE` to a unique index on `(name, team_id)`. Update `database.ts` accordingly:

Replace `name TEXT NOT NULL UNIQUE` with `name TEXT NOT NULL` in the projects table, and add:
```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_name_team ON projects(name, team_id);
```

- [ ] **Step 4: Update ProjectService**

```typescript
import type { ProjectRepository } from "../ports/project.repository.js";

export class ProjectService {
	constructor(private repo: ProjectRepository) {}

	create(name: string, description: string | null, teamId: string): void {
		if (this.repo.findByName(name, teamId)) {
			throw new ConflictError(`Project '${name}' already exists`);
		}
		this.repo.create(name, description, teamId);
	}
}

export class ConflictError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ConflictError";
	}
}
```

- [ ] **Step 5: Update project service tests**

Pass `teamId` to `create` and `findByName` calls.

- [ ] **Step 6: Run all tests**

Run: `npm run test -w packages/server -- --reporter verbose`

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/ports/project.repository.ts packages/server/src/adapters/persistence/sqlite.project.repo.ts packages/server/src/adapters/persistence/sqlite.project.repo.test.ts packages/server/src/application/project.service.ts packages/server/src/application/project.service.test.ts packages/server/src/adapters/persistence/database.ts
git commit -m "feat(server): team-scoped project repository + service"
```

---

### Task 18: Add team scoping to decision repository + service

**Files:**
- Modify: `packages/server/src/ports/decision.repository.ts`
- Modify: `packages/server/src/adapters/persistence/sqlite.decision.repo.ts`
- Modify: `packages/server/src/adapters/persistence/sqlite.decision.repo.test.ts`
- Modify: `packages/server/src/application/decision.service.ts`
- Modify: `packages/server/src/application/decision.service.test.ts`

- [ ] **Step 1: Update DecisionRepository port**

Add `teamId` parameter to `list` and `searchByVector`:

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
		teamId?: string;
	}): Decision[];
	searchByVector(
		embedding: number[],
		limit: number,
		project?: string,
		teamId?: string,
	): SearchResult[];
}
```

- [ ] **Step 2: Update SqliteDecisionRepo**

For `list`: add a `teamId` condition that joins through projects:
```sql
JOIN projects p ON d.project = p.name WHERE p.team_id = ?
```

For `searchByVector`: after fetching vectors, when looking up decisions, also check team membership by joining projects.

- [ ] **Step 3: Update decision repo tests**

Seed a team in `beforeEach`, pass `teamId` to list/search calls. Test that team filtering works (can't see other team's decisions).

- [ ] **Step 4: Update DecisionService**

Add `teamId` parameter to `list` and `search`:

```typescript
list(options?: {
	project?: string;
	status?: DecisionStatus;
	limit?: number;
	teamId?: string;
}): Decision[] {
	return this.repo.list(options);
}

async search(
	project: string,
	query: string,
	threshold: number,
	limit: number,
	teamId?: string,
): Promise<SearchResult[]> {
	const vector = await this.embedding.embed(buildQueryTemplate(query));
	const results = this.repo.searchByVector(vector, limit, project, teamId);
	return results.filter((r) => r.score >= threshold);
}
```

- [ ] **Step 5: Update decision service tests**

- [ ] **Step 6: Run all tests**

Run: `npm run test -w packages/server -- --reporter verbose`

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/ports/decision.repository.ts packages/server/src/adapters/persistence/sqlite.decision.repo.ts packages/server/src/adapters/persistence/sqlite.decision.repo.test.ts packages/server/src/application/decision.service.ts packages/server/src/application/decision.service.test.ts
git commit -m "feat(server): team-scoped decision repository + service"
```

---

### Task 19: Update existing routes to use team context

**Files:**
- Modify: `packages/server/src/adapters/http/routes/decisions.ts`
- Modify: `packages/server/src/adapters/http/routes/decisions.test.ts`
- Modify: `packages/server/src/adapters/http/routes/projects.ts`
- Modify: `packages/server/src/adapters/http/routes/projects.test.ts`

- [ ] **Step 1: Update decision routes**

Change the `Hono` type to `Hono<AppEnv>` and read `teamId` from context:

- `POST /decisions`: pass `c.get("teamId")` — no change needed here since decisions reference a project, and team scoping is at project level
- `GET /decisions`: pass `teamId` to `service.list()`
- `POST /decisions/search`: pass `teamId` to `service.search()`
- `GET /decisions/:id`, `PATCH /decisions/:id`, `DELETE /decisions/:id`: these work on individual decisions by ID, no team filter needed (the decision exists or it doesn't)

```typescript
import { Hono } from "hono";
import type { AppEnv } from "../app.js";
import type { DecisionService } from "../../../application/decision.service.js";
import { NotFoundError } from "../../../application/decision.service.js";

export function decisionRoutes(service: DecisionService): Hono<AppEnv> {
	const router = new Hono<AppEnv>();

	router.post("/search", async (c) => {
		const body = await c.req.json();
		if (!body.project) return c.text("project is required", 400);
		if (!body.query) return c.text("query is required", 400);
		const teamId = c.get("teamId");
		const results = await service.search(
			body.project,
			body.query,
			body.threshold ?? 0,
			body.limit ?? 20,
			teamId,
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
			if (e instanceof NotFoundError) return c.text(e.message, 404);
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
		const teamId = c.get("teamId");
		const decisions = service.list({
			project: project || undefined,
			status: (status as "active" | "superseded" | "deprecated") || undefined,
			limit: limit ? Number(limit) : undefined,
			teamId,
		});
		return c.json(decisions, 200);
	});

	return router;
}
```

- [ ] **Step 2: Update project routes**

Pass `teamId` from context to service:

```typescript
import { Hono } from "hono";
import type { AppEnv } from "../app.js";
import type { ProjectService } from "../../../application/project.service.js";
import { ConflictError } from "../../../application/project.service.js";

export function projectRoutes(service: ProjectService): Hono<AppEnv> {
	const router = new Hono<AppEnv>();

	router.post("/", async (c) => {
		const body = await c.req.json();
		if (!body.name) return c.text("name is required", 400);
		try {
			service.create(body.name, body.description ?? null, c.get("teamId"));
			return c.body(null, 201);
		} catch (e) {
			if (e instanceof ConflictError) return c.text(e.message, 409);
			throw e;
		}
	});

	return router;
}
```

- [ ] **Step 3: Update decision route tests**

Rewrite tests to use the full middleware pipeline (auth + team) with bootstrap. Seed a project with `team_id`. Add a test verifying cross-team isolation.

- [ ] **Step 4: Update project route tests**

Same — use bootstrap, send `X-Team` header, verify team scoping.

- [ ] **Step 5: Run all tests**

Run: `npm run test -w packages/server -- --reporter verbose`

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/adapters/http/routes/decisions.ts packages/server/src/adapters/http/routes/decisions.test.ts packages/server/src/adapters/http/routes/projects.ts packages/server/src/adapters/http/routes/projects.test.ts
git commit -m "feat(server): team-scoped decision + project routes"
```

---

### Task 20: Wire everything in app.ts + index.ts

**Files:**
- Modify: `packages/server/src/adapters/http/app.ts`
- Modify: `packages/server/src/index.ts`

- [ ] **Step 1: Rewrite app.ts**

```typescript
import { Hono } from "hono";
import type { DecisionService } from "../../application/decision.service.js";
import type { ProjectService } from "../../application/project.service.js";
import type { TeamService } from "../../application/team.service.js";
import type { TokenService } from "../../application/token.service.js";
import type { UserService } from "../../application/user.service.js";
import { createAuthMiddleware } from "./middleware/auth.js";
import { teamMiddleware } from "./middleware/team.js";
import { authRoutes } from "./routes/auth.js";
import { decisionRoutes } from "./routes/decisions.js";
import { projectRoutes } from "./routes/projects.js";
import { teamRoutes } from "./routes/teams.js";
import { tokenRoutes } from "./routes/tokens.js";
import { userRoutes } from "./routes/users.js";

export type AppEnv = {
	Variables: {
		userId: string;
		teamId: string;
		role: "admin" | "member";
	};
};

export interface AppDeps {
	tokenService: TokenService;
	teamService: TeamService;
	userService: UserService;
	decisionService: DecisionService;
	projectService: ProjectService;
}

export function createApp(deps: AppDeps): Hono<AppEnv> {
	const app = new Hono<AppEnv>();
	app.use("*", createAuthMiddleware(deps.tokenService));
	app.use("*", teamMiddleware(deps.teamService));
	app.route("/auth", authRoutes());
	app.route("/decisions", decisionRoutes(deps.decisionService));
	app.route("/projects", projectRoutes(deps.projectService));
	app.route("/teams", teamRoutes(deps.teamService));
	app.route("/users", userRoutes(deps.userService));
	app.route("/tokens", tokenRoutes(deps.tokenService));
	return app;
}
```

- [ ] **Step 2: Rewrite index.ts**

```typescript
import { serve } from "@hono/node-server";
import { OllamaProvider } from "./adapters/embedding/ollama.provider.js";
import { createApp } from "./adapters/http/app.js";
import { createDatabase } from "./adapters/persistence/database.js";
import { SqliteDecisionRepo } from "./adapters/persistence/sqlite.decision.repo.js";
import { SqliteProjectRepo } from "./adapters/persistence/sqlite.project.repo.js";
import { SqliteTeamRepo } from "./adapters/persistence/sqlite.team.repo.js";
import { SqliteTokenRepo } from "./adapters/persistence/sqlite.token.repo.js";
import { SqliteUserRepo } from "./adapters/persistence/sqlite.user.repo.js";
import { DecisionService } from "./application/decision.service.js";
import { ProjectService } from "./application/project.service.js";
import { TeamService } from "./application/team.service.js";
import { TokenService } from "./application/token.service.js";
import { UserService } from "./application/user.service.js";
import { bootstrap } from "./application/bootstrap.js";
import { loadConfig } from "./config.js";

const config = loadConfig();

const db = createDatabase(config.dbPath);
const embeddingProvider = new OllamaProvider(config.ollamaUrl, config.model);

const userRepo = new SqliteUserRepo(db);
const teamRepo = new SqliteTeamRepo(db);
const tokenRepo = new SqliteTokenRepo(db);
const decisionRepo = new SqliteDecisionRepo(db);
const projectRepo = new SqliteProjectRepo(db);

const tokenService = new TokenService(tokenRepo);
const teamService = new TeamService(teamRepo);
const userService = new UserService(userRepo, tokenService);
const decisionService = new DecisionService(decisionRepo, embeddingProvider);
const projectService = new ProjectService(projectRepo);

bootstrap({ db, userRepo, teamRepo, tokenService, apiToken: config.apiToken });

const app = createApp({
	tokenService,
	teamService,
	userService,
	decisionService,
	projectService,
});

serve({ fetch: app.fetch, port: config.port }, (info) => {
	console.log(`logd server listening on http://localhost:${info.port}`);
});
```

- [ ] **Step 3: Update config to make apiToken optional**

In `packages/server/src/config.ts`, change `apiToken` from required to optional:

```typescript
export interface Config {
	port: number;
	apiToken: string | undefined;
	dbPath: string;
	ollamaUrl: string;
	model: string;
}

export function loadConfig(): Config {
	return {
		port: Number(process.env.LOGD_PORT) || 3000,
		apiToken: process.env.LOGD_API_TOKEN,
		dbPath: process.env.LOGD_DB_PATH || "./logd-server.db",
		ollamaUrl: process.env.LOGD_OLLAMA_URL || "http://localhost:11434",
		model: process.env.LOGD_MODEL || "qwen3-embedding:0.6b",
	};
}
```

- [ ] **Step 4: Typecheck + build**

Run: `npm run typecheck -w packages/server && npm run build -w packages/server`

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/adapters/http/app.ts packages/server/src/index.ts packages/server/src/config.ts
git commit -m "feat(server): wire team/auth — app factory, DI, bootstrap"
```

---

### Task 21: Lint, format, full test suite

**Files:**
- Any files flagged by linter

- [ ] **Step 1: Format**

Run: `npx biome format --write packages/server/ packages/shared/`

- [ ] **Step 2: Lint + fix**

Run: `npx biome check --write --unsafe packages/server/`

- [ ] **Step 3: Run full server tests**

Run: `npm run test -w packages/server -- --reporter verbose`
Expected: all pass

- [ ] **Step 4: Run full monorepo build + test**

Run: `npm run build && npm run test`
Expected: all packages build and test clean

- [ ] **Step 5: Commit any fixes**

```bash
git add -A packages/server/ packages/shared/
git commit -m "chore(server): lint + format fixes"
```

- [ ] **Step 6: Close issue #35**

Run: `gh issue close 35 --comment "Phase 2b: team & auth management implemented"`
