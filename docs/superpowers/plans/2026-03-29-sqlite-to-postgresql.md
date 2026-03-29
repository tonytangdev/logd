# SQLite to PostgreSQL Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace SQLite with PostgreSQL using Drizzle ORM, pgvector, and PGlite for tests.

**Architecture:** Swap all 5 SQLite repository implementations with Postgres equivalents behind existing port interfaces. All repo methods become async. Drizzle ORM provides type-safe schema + queries. PGlite provides in-process Postgres for tests.

**Tech Stack:** drizzle-orm, postgres (postgres.js), @electric-sql/pglite, pgvector, drizzle-kit

---

### Task 1: Update Dependencies

**Files:**
- Modify: `packages/server/package.json`

- [ ] **Step 1: Install new deps and remove old**

```bash
cd packages/server
npm install drizzle-orm postgres
npm install -D drizzle-kit @electric-sql/pglite
npm uninstall better-sqlite3 sqlite-vec @types/better-sqlite3
```

- [ ] **Step 2: Verify package.json**

Run: `cat packages/server/package.json`
Expected: `drizzle-orm`, `postgres` in dependencies. `drizzle-kit`, `@electric-sql/pglite` in devDependencies. No `better-sqlite3`, `sqlite-vec`, or `@types/better-sqlite3`.

- [ ] **Step 3: Commit**

```bash
git add packages/server/package.json package-lock.json
git commit -m "chore(server): swap SQLite deps for Drizzle + Postgres + PGlite (#37)"
```

---

### Task 2: Drizzle Schema + Config

**Files:**
- Create: `packages/server/src/adapters/persistence/schema.ts`
- Create: `packages/server/drizzle.config.ts`

- [ ] **Step 1: Create Drizzle schema**

Write `packages/server/src/adapters/persistence/schema.ts`:

```typescript
import {
	index,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uniqueIndex,
	vector,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
	id: text("id").primaryKey(),
	email: text("email").notNull().unique(),
	name: text("name").notNull(),
	createdAt: text("created_at")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
});

export const teams = pgTable("teams", {
	id: text("id").primaryKey(),
	name: text("name").notNull().unique(),
	createdAt: text("created_at")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
});

export const teamMembers = pgTable(
	"team_members",
	{
		userId: text("user_id")
			.notNull()
			.references(() => users.id),
		teamId: text("team_id")
			.notNull()
			.references(() => teams.id),
		role: text("role").notNull(),
		createdAt: text("created_at")
			.notNull()
			.$defaultFn(() => new Date().toISOString()),
	},
	(table) => [primaryKey({ columns: [table.userId, table.teamId] })],
);

export const tokens = pgTable("tokens", {
	id: text("id").primaryKey(),
	userId: text("user_id")
		.notNull()
		.references(() => users.id),
	tokenHash: text("token_hash").notNull().unique(),
	name: text("name").notNull(),
	createdAt: text("created_at")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
	lastUsedAt: text("last_used_at"),
});

export const projects = pgTable(
	"projects",
	{
		id: text("id").primaryKey(),
		name: text("name").notNull().unique(),
		description: text("description"),
		teamId: text("team_id").references(() => teams.id),
		createdAt: text("created_at")
			.notNull()
			.$defaultFn(() => new Date().toISOString()),
	},
	(table) => [
		uniqueIndex("idx_projects_name_team").on(table.name, table.teamId),
	],
);

export const decisions = pgTable("decisions", {
	id: text("id").primaryKey(),
	project: text("project")
		.notNull()
		.references(() => projects.name),
	title: text("title").notNull(),
	context: text("context"),
	alternatives: text("alternatives"),
	tags: text("tags"),
	status: text("status").notNull().default("active"),
	links: text("links"),
	createdAt: text("created_at")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
	updatedAt: text("updated_at")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
});

export const decisionsVec = pgTable("decisions_vec", {
	id: text("id")
		.primaryKey()
		.references(() => decisions.id),
	embedding: vector("embedding", { dimensions: 1024 }),
});
```

- [ ] **Step 2: Create drizzle.config.ts**

Write `packages/server/drizzle.config.ts`:

```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
	dialect: "postgresql",
	schema: "./src/adapters/persistence/schema.ts",
	out: "./drizzle",
});
```

- [ ] **Step 3: Verify typecheck**

Run: `cd packages/server && npx tsc --noEmit --skipLibCheck 2>&1 | head -20`
Expected: Schema file compiles without errors (other files may error due to missing SQLite types — that's expected at this stage).

- [ ] **Step 4: Generate initial migration**

```bash
cd packages/server && npx drizzle-kit generate
```

Expected: Migration files created in `packages/server/drizzle/` directory. Verify the SQL contains `CREATE TABLE` statements for all tables and a `vector(1024)` column.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/adapters/persistence/schema.ts packages/server/drizzle.config.ts packages/server/drizzle/
git commit -m "feat(server): add Drizzle schema, config, and initial migration (#37)"
```

---

### Task 3: Database Connection + Test Helper

**Files:**
- Modify: `packages/server/src/adapters/persistence/database.ts`

- [ ] **Step 1: Rewrite database.ts**

Replace the entire contents of `packages/server/src/adapters/persistence/database.ts`:

```typescript
import { type PostgresJsDatabase, drizzle } from "drizzle-orm/postgres-js";
import type { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePostgresJs } from "drizzle-orm/postgres-js/migrator";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import postgres from "postgres";
import * as schema from "./schema.js";

export type Database = PostgresJsDatabase<typeof schema>;

export async function createDatabase(
	databaseUrl: string,
): Promise<Database> {
	const client = postgres(databaseUrl);
	const db = drizzle(client, { schema });
	await db.execute("CREATE EXTENSION IF NOT EXISTS vector");
	await migratePostgresJs(db, { migrationsFolder: "./drizzle" });
	return db;
}

export async function createTestDatabase(
	pglite: PGlite,
): Promise<Database> {
	const db = drizzlePglite(pglite, { schema }) as unknown as Database;
	await db.execute("CREATE EXTENSION IF NOT EXISTS vector");
	await migratePglite(db as any, { migrationsFolder: "./drizzle" });
	return db;
}
```

**Notes:**
- Production uses `PostgresJsDatabase<typeof schema>` from `drizzle-orm/postgres-js` — matches the `postgres` (postgres.js) driver.
- PGlite adapter returns a different type (`PgliteDatabase`) — cast needed since repos accept `Database`. This works because both implement the same Drizzle query interface.
- Both `createDatabase` and `createTestDatabase` run migrations automatically, so tables exist before repos are used.
- The `migrationsFolder` path is relative to CWD. In production, CWD is the project root. In tests, vitest runs from `packages/server/`.

- [ ] **Step 2: Commit**

```bash
git add packages/server/src/adapters/persistence/database.ts
git commit -m "feat(server): Postgres + PGlite database connection (#37)"
```

---

### Task 4: Make Port Interfaces Async

**Files:**
- Modify: `packages/server/src/ports/decision.repository.ts`
- Modify: `packages/server/src/ports/user.repository.ts`
- Modify: `packages/server/src/ports/team.repository.ts`
- Modify: `packages/server/src/ports/token.repository.ts`
- Modify: `packages/server/src/ports/project.repository.ts`

- [ ] **Step 1: Update DecisionRepository**

In `packages/server/src/ports/decision.repository.ts`, make all methods return Promises:

```typescript
import type {
	Decision,
	DecisionStatus,
	SearchResult,
	UpdateDecisionInput,
} from "@logd/shared";

export interface DecisionRepository {
	create(decision: Decision, embedding: number[]): Promise<void>;
	findById(id: string): Promise<Decision | null>;
	update(id: string, input: UpdateDecisionInput, embedding?: number[]): Promise<void>;
	delete(id: string): Promise<void>;
	list(options?: {
		project?: string;
		status?: DecisionStatus;
		limit?: number;
		teamId?: string;
	}): Promise<Decision[]>;
	searchByVector(
		embedding: number[],
		limit: number,
		project?: string,
		teamId?: string,
	): Promise<SearchResult[]>;
}
```

- [ ] **Step 2: Update UserRepository**

In `packages/server/src/ports/user.repository.ts`:

```typescript
import type { User } from "@logd/shared";

export interface UserRepository {
	create(user: User): Promise<void>;
	findById(id: string): Promise<User | null>;
	findByEmail(email: string): Promise<User | null>;
	listByTeam(teamId: string): Promise<User[]>;
	isEmpty(): Promise<boolean>;
}
```

- [ ] **Step 3: Update TeamRepository**

In `packages/server/src/ports/team.repository.ts`:

```typescript
import type { Team, TeamMember, TeamRole } from "@logd/shared";

export interface TeamRepository {
	create(team: Team): Promise<void>;
	findById(id: string): Promise<Team | null>;
	findByName(name: string): Promise<Team | null>;
	listByUser(userId: string): Promise<Team[]>;
	delete(id: string): Promise<void>;
	hasProjects(teamId: string): Promise<boolean>;

	addMember(teamId: string, userId: string, role: TeamRole): Promise<void>;
	removeMember(teamId: string, userId: string): Promise<void>;
	updateMemberRole(teamId: string, userId: string, role: TeamRole): Promise<void>;
	getMembership(
		userId: string,
		teamName: string,
	): Promise<{ teamId: string; role: TeamRole } | null>;
	listMembers(teamId: string): Promise<TeamMember[]>;
}
```

- [ ] **Step 4: Update TokenRepository**

In `packages/server/src/ports/token.repository.ts`:

```typescript
import type { Token } from "@logd/shared";

export interface TokenRepository {
	create(token: Token, tokenHash: string): Promise<void>;
	findByHash(tokenHash: string): Promise<{ token: Token; userId: string } | null>;
	listByUser(userId: string): Promise<Token[]>;
	delete(id: string): Promise<void>;
	touchLastUsed(tokenHash: string): Promise<void>;
}
```

- [ ] **Step 5: Update ProjectRepository**

In `packages/server/src/ports/project.repository.ts`:

```typescript
export interface ProjectRepository {
	create(name: string, description: string | null, teamId: string): Promise<void>;
	findByName(name: string): Promise<boolean>;
}
```

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/ports/
git commit -m "refactor(server): make all port interfaces async (#37)"
```

---

### Task 5: Implement PgUserRepo

**Files:**
- Create: `packages/server/src/adapters/persistence/pg.user.repo.ts`
- Create: `packages/server/src/adapters/persistence/pg.user.repo.test.ts`

- [ ] **Step 1: Write the test**

Write `packages/server/src/adapters/persistence/pg.user.repo.test.ts`:

```typescript
import type { User } from "@logd/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setupTestDb } from "../../test-utils.js";
import type { Database } from "./database.js";
import { PgUserRepo } from "./pg.user.repo.js";
import * as schema from "./schema.js";
import type { PGlite } from "@electric-sql/pglite";

function makeUser(overrides?: Partial<User>): User {
	return {
		id: "u-1",
		email: "tony@example.com",
		name: "Tony",
		createdAt: "2026-01-01T00:00:00.000Z",
		...overrides,
	};
}

describe("PgUserRepo", () => {
	let db: Database;
	let repo: PgUserRepo;
	let pglite: PGlite;

	beforeEach(async () => {
		({ db, pglite } = await setupTestDb());
		repo = new PgUserRepo(db);
	});

	afterEach(async () => {
		await pglite.close();
	});

	it("create + findById round-trips", async () => {
		await repo.create(makeUser());
		const found = await repo.findById("u-1");
		expect(found).not.toBeNull();
		expect(found?.email).toBe("tony@example.com");
	});

	it("findById returns null for missing", async () => {
		expect(await repo.findById("nope")).toBeNull();
	});

	it("findByEmail is case-insensitive", async () => {
		await repo.create(makeUser());
		const found = await repo.findByEmail("Tony@Example.com");
		expect(found).not.toBeNull();
	});

	it("findByEmail returns null for missing", async () => {
		expect(await repo.findByEmail("nope@example.com")).toBeNull();
	});

	it("throws on duplicate email", async () => {
		await repo.create(makeUser());
		await expect(repo.create(makeUser({ id: "u-2" }))).rejects.toThrow();
	});

	it("isEmpty returns true on empty DB", async () => {
		expect(await repo.isEmpty()).toBe(true);
	});

	it("isEmpty returns false after create", async () => {
		await repo.create(makeUser());
		expect(await repo.isEmpty()).toBe(false);
	});

	it("listByTeam returns users in team", async () => {
		await repo.create(makeUser());
		await db.insert(schema.teams).values({
			id: "t-1",
			name: "acme",
			createdAt: "2026-01-01",
		});
		await db.insert(schema.teamMembers).values({
			userId: "u-1",
			teamId: "t-1",
			role: "admin",
			createdAt: "2026-01-01",
		});
		const users = await repo.listByTeam("t-1");
		expect(users).toHaveLength(1);
		expect(users[0].id).toBe("u-1");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/server && npx vitest run src/adapters/persistence/pg.user.repo.test.ts`
Expected: FAIL — `pg.user.repo.ts` doesn't exist yet.

- [ ] **Step 3: Implement PgUserRepo**

Write `packages/server/src/adapters/persistence/pg.user.repo.ts`:

```typescript
import type { User } from "@logd/shared";
import { eq, sql } from "drizzle-orm";
import type { UserRepository } from "../../ports/user.repository.js";
import type { Database } from "./database.js";
import * as schema from "./schema.js";

export class PgUserRepo implements UserRepository {
	constructor(private db: Database) {}

	async create(user: User): Promise<void> {
		await this.db.insert(schema.users).values({
			id: user.id,
			email: user.email,
			name: user.name,
			createdAt: user.createdAt,
		});
	}

	async findById(id: string): Promise<User | null> {
		const rows = await this.db
			.select()
			.from(schema.users)
			.where(eq(schema.users.id, id))
			.limit(1);
		return rows[0] ? this.toUser(rows[0]) : null;
	}

	async findByEmail(email: string): Promise<User | null> {
		const rows = await this.db
			.select()
			.from(schema.users)
			.where(sql`LOWER(${schema.users.email}) = LOWER(${email})`)
			.limit(1);
		return rows[0] ? this.toUser(rows[0]) : null;
	}

	async listByTeam(teamId: string): Promise<User[]> {
		const rows = await this.db
			.select({
				id: schema.users.id,
				email: schema.users.email,
				name: schema.users.name,
				createdAt: schema.users.createdAt,
			})
			.from(schema.users)
			.innerJoin(
				schema.teamMembers,
				eq(schema.users.id, schema.teamMembers.userId),
			)
			.where(eq(schema.teamMembers.teamId, teamId))
			.orderBy(schema.users.name);
		return rows.map((r) => this.toUser(r));
	}

	async isEmpty(): Promise<boolean> {
		const rows = await this.db
			.select({ id: schema.users.id })
			.from(schema.users)
			.limit(1);
		return rows.length === 0;
	}

	private toUser(row: typeof schema.users.$inferSelect): User {
		return {
			id: row.id,
			email: row.email,
			name: row.name,
			createdAt: row.createdAt,
		};
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/server && npx vitest run src/adapters/persistence/pg.user.repo.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/adapters/persistence/pg.user.repo.ts packages/server/src/adapters/persistence/pg.user.repo.test.ts
git commit -m "feat(server): add PgUserRepo with tests (#37)"
```

---

### Task 6: Implement PgTeamRepo

**Files:**
- Create: `packages/server/src/adapters/persistence/pg.team.repo.ts`
- Create: `packages/server/src/adapters/persistence/pg.team.repo.test.ts`

- [ ] **Step 1: Write the test**

Write `packages/server/src/adapters/persistence/pg.team.repo.test.ts`. Mirror the existing `sqlite.team.repo.test.ts` structure but with PGlite setup, async calls, and using `PgTeamRepo`. Tests should cover:
- create + findById round-trips
- findByName case-insensitive
- findByName returns null for missing
- listByUser
- delete cascades team_members
- hasProjects true/false
- addMember, removeMember, updateMemberRole
- getMembership
- listMembers

Use the same PGlite `beforeEach`/`afterEach` pattern from Task 5. Also insert a user via `PgUserRepo` or direct `db.insert(schema.users)` for FK constraints.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/server && npx vitest run src/adapters/persistence/pg.team.repo.test.ts`
Expected: FAIL — file doesn't exist yet.

- [ ] **Step 3: Implement PgTeamRepo**

Write `packages/server/src/adapters/persistence/pg.team.repo.ts`:

```typescript
import type { Team, TeamMember, TeamRole } from "@logd/shared";
import { and, eq, sql } from "drizzle-orm";
import type { TeamRepository } from "../../ports/team.repository.js";
import type { Database } from "./database.js";
import * as schema from "./schema.js";

export class PgTeamRepo implements TeamRepository {
	constructor(private db: Database) {}

	async create(team: Team): Promise<void> {
		await this.db.insert(schema.teams).values({
			id: team.id,
			name: team.name,
			createdAt: team.createdAt,
		});
	}

	async findById(id: string): Promise<Team | null> {
		const rows = await this.db
			.select()
			.from(schema.teams)
			.where(eq(schema.teams.id, id))
			.limit(1);
		return rows[0] ? this.toTeam(rows[0]) : null;
	}

	async findByName(name: string): Promise<Team | null> {
		const rows = await this.db
			.select()
			.from(schema.teams)
			.where(sql`LOWER(${schema.teams.name}) = LOWER(${name})`)
			.limit(1);
		return rows[0] ? this.toTeam(rows[0]) : null;
	}

	async listByUser(userId: string): Promise<Team[]> {
		const rows = await this.db
			.select({
				id: schema.teams.id,
				name: schema.teams.name,
				createdAt: schema.teams.createdAt,
			})
			.from(schema.teams)
			.innerJoin(
				schema.teamMembers,
				eq(schema.teams.id, schema.teamMembers.teamId),
			)
			.where(eq(schema.teamMembers.userId, userId))
			.orderBy(schema.teams.name);
		return rows.map((r) => this.toTeam(r));
	}

	async delete(id: string): Promise<void> {
		await this.db
			.delete(schema.teamMembers)
			.where(eq(schema.teamMembers.teamId, id));
		await this.db.delete(schema.teams).where(eq(schema.teams.id, id));
	}

	async hasProjects(teamId: string): Promise<boolean> {
		const rows = await this.db
			.select({ id: schema.projects.id })
			.from(schema.projects)
			.where(eq(schema.projects.teamId, teamId))
			.limit(1);
		return rows.length > 0;
	}

	async addMember(
		teamId: string,
		userId: string,
		role: TeamRole,
	): Promise<void> {
		await this.db.insert(schema.teamMembers).values({
			teamId,
			userId,
			role,
			createdAt: new Date().toISOString(),
		});
	}

	async removeMember(teamId: string, userId: string): Promise<void> {
		await this.db
			.delete(schema.teamMembers)
			.where(
				and(
					eq(schema.teamMembers.teamId, teamId),
					eq(schema.teamMembers.userId, userId),
				),
			);
	}

	async updateMemberRole(
		teamId: string,
		userId: string,
		role: TeamRole,
	): Promise<void> {
		await this.db
			.update(schema.teamMembers)
			.set({ role })
			.where(
				and(
					eq(schema.teamMembers.teamId, teamId),
					eq(schema.teamMembers.userId, userId),
				),
			);
	}

	async getMembership(
		userId: string,
		teamName: string,
	): Promise<{ teamId: string; role: TeamRole } | null> {
		const rows = await this.db
			.select({
				teamId: schema.teamMembers.teamId,
				role: schema.teamMembers.role,
			})
			.from(schema.teamMembers)
			.innerJoin(
				schema.teams,
				eq(schema.teamMembers.teamId, schema.teams.id),
			)
			.where(
				and(
					eq(schema.teamMembers.userId, userId),
					sql`LOWER(${schema.teams.name}) = LOWER(${teamName})`,
				),
			)
			.limit(1);
		return rows[0]
			? { teamId: rows[0].teamId, role: rows[0].role as TeamRole }
			: null;
	}

	async listMembers(teamId: string): Promise<TeamMember[]> {
		const rows = await this.db
			.select()
			.from(schema.teamMembers)
			.where(eq(schema.teamMembers.teamId, teamId))
			.orderBy(schema.teamMembers.createdAt);
		return rows.map((r) => ({
			userId: r.userId,
			teamId: r.teamId,
			role: r.role as TeamRole,
			createdAt: r.createdAt,
		}));
	}

	private toTeam(row: typeof schema.teams.$inferSelect): Team {
		return { id: row.id, name: row.name, createdAt: row.createdAt };
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/server && npx vitest run src/adapters/persistence/pg.team.repo.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/adapters/persistence/pg.team.repo.ts packages/server/src/adapters/persistence/pg.team.repo.test.ts
git commit -m "feat(server): add PgTeamRepo with tests (#37)"
```

---

### Task 7: Implement PgTokenRepo

**Files:**
- Create: `packages/server/src/adapters/persistence/pg.token.repo.ts`
- Create: `packages/server/src/adapters/persistence/pg.token.repo.test.ts`

- [ ] **Step 1: Write the test**

Mirror `sqlite.token.repo.test.ts` structure with PGlite setup. Tests:
- create + findByHash round-trips
- findByHash returns null for missing
- listByUser returns tokens in desc order
- delete removes token
- touchLastUsed updates timestamp

Must first insert a user for FK constraint.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/server && npx vitest run src/adapters/persistence/pg.token.repo.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement PgTokenRepo**

Write `packages/server/src/adapters/persistence/pg.token.repo.ts`:

```typescript
import type { Token } from "@logd/shared";
import { eq } from "drizzle-orm";
import type { TokenRepository } from "../../ports/token.repository.js";
import type { Database } from "./database.js";
import * as schema from "./schema.js";

export class PgTokenRepo implements TokenRepository {
	constructor(private db: Database) {}

	async create(token: Token, tokenHash: string): Promise<void> {
		await this.db.insert(schema.tokens).values({
			id: token.id,
			userId: token.userId,
			tokenHash,
			name: token.name,
			createdAt: token.createdAt,
			lastUsedAt: token.lastUsedAt,
		});
	}

	async findByHash(
		tokenHash: string,
	): Promise<{ token: Token; userId: string } | null> {
		const rows = await this.db
			.select()
			.from(schema.tokens)
			.where(eq(schema.tokens.tokenHash, tokenHash))
			.limit(1);
		if (!rows[0]) return null;
		const row = rows[0];
		return {
			token: {
				id: row.id,
				userId: row.userId,
				name: row.name,
				createdAt: row.createdAt,
				lastUsedAt: row.lastUsedAt,
			},
			userId: row.userId,
		};
	}

	async listByUser(userId: string): Promise<Token[]> {
		const rows = await this.db
			.select()
			.from(schema.tokens)
			.where(eq(schema.tokens.userId, userId))
			.orderBy(schema.tokens.createdAt);
		return rows.map((r) => ({
			id: r.id,
			userId: r.userId,
			name: r.name,
			createdAt: r.createdAt,
			lastUsedAt: r.lastUsedAt,
		}));
	}

	async delete(id: string): Promise<void> {
		await this.db.delete(schema.tokens).where(eq(schema.tokens.id, id));
	}

	async touchLastUsed(tokenHash: string): Promise<void> {
		await this.db
			.update(schema.tokens)
			.set({ lastUsedAt: new Date().toISOString() })
			.where(eq(schema.tokens.tokenHash, tokenHash));
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/server && npx vitest run src/adapters/persistence/pg.token.repo.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/adapters/persistence/pg.token.repo.ts packages/server/src/adapters/persistence/pg.token.repo.test.ts
git commit -m "feat(server): add PgTokenRepo with tests (#37)"
```

---

### Task 8: Implement PgProjectRepo

**Files:**
- Create: `packages/server/src/adapters/persistence/pg.project.repo.ts`
- Create: `packages/server/src/adapters/persistence/pg.project.repo.test.ts`

- [ ] **Step 1: Write the test**

Tests:
- create + findByName returns true
- findByName returns false for missing
- findByName is case-insensitive
- throws on duplicate name

Must first insert a team for FK constraint.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/server && npx vitest run src/adapters/persistence/pg.project.repo.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement PgProjectRepo**

Write `packages/server/src/adapters/persistence/pg.project.repo.ts`:

```typescript
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { ProjectRepository } from "../../ports/project.repository.js";
import type { Database } from "./database.js";
import * as schema from "./schema.js";

export class PgProjectRepo implements ProjectRepository {
	constructor(private db: Database) {}

	async create(
		name: string,
		description: string | null,
		teamId: string,
	): Promise<void> {
		await this.db.insert(schema.projects).values({
			id: randomUUID(),
			name,
			description,
			teamId,
			createdAt: new Date().toISOString(),
		});
	}

	async findByName(name: string): Promise<boolean> {
		const rows = await this.db
			.select({ id: schema.projects.id })
			.from(schema.projects)
			.where(sql`LOWER(${schema.projects.name}) = LOWER(${name.trim()})`)
			.limit(1);
		return rows.length > 0;
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/server && npx vitest run src/adapters/persistence/pg.project.repo.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/adapters/persistence/pg.project.repo.ts packages/server/src/adapters/persistence/pg.project.repo.test.ts
git commit -m "feat(server): add PgProjectRepo with tests (#37)"
```

---

### Task 9: Implement PgDecisionRepo

**Files:**
- Create: `packages/server/src/adapters/persistence/pg.decision.repo.ts`
- Create: `packages/server/src/adapters/persistence/pg.decision.repo.test.ts`

- [ ] **Step 1: Write the test**

Mirror `sqlite.decision.repo.test.ts` with PGlite setup. Tests:
- create + findById round-trips (JSON fields: alternatives, tags, links)
- findById returns null for missing
- update changes fields and updatedAt
- delete removes from both tables
- list filters by project, status, limit, teamId
- searchByVector returns results sorted by score
- searchByVector filters by project and teamId

Must first insert a team + project via `db.insert()` for FK constraints.

**Important:** Vector search test — insert decisions with known embeddings, search with same embedding, verify `score > 0`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/server && npx vitest run src/adapters/persistence/pg.decision.repo.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement PgDecisionRepo**

Write `packages/server/src/adapters/persistence/pg.decision.repo.ts`:

```typescript
import type {
	Decision,
	DecisionStatus,
	SearchResult,
	UpdateDecisionInput,
} from "@logd/shared";
import { cosineDistance, eq, sql, and, desc } from "drizzle-orm";
import type { DecisionRepository } from "../../ports/decision.repository.js";
import type { Database } from "./database.js";
import * as schema from "./schema.js";

export class PgDecisionRepo implements DecisionRepository {
	constructor(private db: Database) {}

	async create(decision: Decision, embedding: number[]): Promise<void> {
		await this.db.insert(schema.decisions).values({
			id: decision.id,
			project: decision.project,
			title: decision.title,
			context: decision.context,
			alternatives: decision.alternatives
				? JSON.stringify(decision.alternatives)
				: null,
			tags: decision.tags ? JSON.stringify(decision.tags) : null,
			status: decision.status,
			links: decision.links ? JSON.stringify(decision.links) : null,
			createdAt: decision.createdAt,
			updatedAt: decision.updatedAt,
		});

		await this.db.insert(schema.decisionsVec).values({
			id: decision.id,
			embedding,
		});
	}

	async findById(id: string): Promise<Decision | null> {
		const rows = await this.db
			.select()
			.from(schema.decisions)
			.where(eq(schema.decisions.id, id))
			.limit(1);
		return rows[0] ? this.toDecision(rows[0]) : null;
	}

	async update(
		id: string,
		input: UpdateDecisionInput,
		embedding?: number[],
	): Promise<void> {
		const updates: Record<string, unknown> = {};

		if (input.project !== undefined) updates.project = input.project;
		if (input.title !== undefined) updates.title = input.title;
		if (input.context !== undefined) updates.context = input.context;
		if (input.alternatives !== undefined)
			updates.alternatives = JSON.stringify(input.alternatives);
		if (input.tags !== undefined) updates.tags = JSON.stringify(input.tags);
		if (input.status !== undefined) updates.status = input.status;
		if (input.links !== undefined) updates.links = JSON.stringify(input.links);

		if (Object.keys(updates).length > 0) {
			updates.updatedAt = new Date().toISOString();
			await this.db
				.update(schema.decisions)
				.set(updates)
				.where(eq(schema.decisions.id, id));
		}

		if (embedding) {
			await this.db
				.update(schema.decisionsVec)
				.set({ embedding })
				.where(eq(schema.decisionsVec.id, id));
		}
	}

	async delete(id: string): Promise<void> {
		await this.db
			.delete(schema.decisionsVec)
			.where(eq(schema.decisionsVec.id, id));
		await this.db
			.delete(schema.decisions)
			.where(eq(schema.decisions.id, id));
	}

	async list(
		options: {
			project?: string;
			status?: DecisionStatus;
			limit?: number;
			teamId?: string;
		} = {},
	): Promise<Decision[]> {
		const limit = options.limit ?? 20;
		const conditions = [];

		if (options.teamId) {
			conditions.push(eq(schema.projects.teamId, options.teamId));
		}
		if (options.project) {
			conditions.push(eq(schema.decisions.project, options.project));
		}
		if (options.status) {
			conditions.push(eq(schema.decisions.status, options.status));
		}

		if (options.teamId) {
			const rows = await this.db
				.select({
					id: schema.decisions.id,
					project: schema.decisions.project,
					title: schema.decisions.title,
					context: schema.decisions.context,
					alternatives: schema.decisions.alternatives,
					tags: schema.decisions.tags,
					status: schema.decisions.status,
					links: schema.decisions.links,
					createdAt: schema.decisions.createdAt,
					updatedAt: schema.decisions.updatedAt,
				})
				.from(schema.decisions)
				.innerJoin(
					schema.projects,
					eq(schema.decisions.project, schema.projects.name),
				)
				.where(and(...conditions))
				.orderBy(desc(schema.decisions.createdAt))
				.limit(limit);
			return rows.map((r) => this.toDecision(r));
		}

		const where =
			conditions.length > 0 ? and(...conditions) : undefined;
		const rows = await this.db
			.select()
			.from(schema.decisions)
			.where(where)
			.orderBy(desc(schema.decisions.createdAt))
			.limit(limit);
		return rows.map((r) => this.toDecision(r));
	}

	async searchByVector(
		embedding: number[],
		limit: number,
		project?: string,
		teamId?: string,
	): Promise<SearchResult[]> {
		const distance = cosineDistance(schema.decisionsVec.embedding, embedding);
		const vecRows = await this.db
			.select({
				id: schema.decisionsVec.id,
				distance,
			})
			.from(schema.decisionsVec)
			.orderBy(distance)
			.limit(limit);

		const results: SearchResult[] = [];
		for (const row of vecRows) {
			const decision = await this.findById(row.id);
			if (!decision) continue;
			if (project && decision.project !== project) continue;
			if (teamId) {
				const projectRows = await this.db
					.select({ teamId: schema.projects.teamId })
					.from(schema.projects)
					.where(eq(schema.projects.name, decision.project))
					.limit(1);
				if (!projectRows[0] || projectRows[0].teamId !== teamId) continue;
			}
			results.push({ decision, score: 1 - Number(row.distance) });
		}

		return results;
	}

	private toDecision(
		row: typeof schema.decisions.$inferSelect,
	): Decision {
		return {
			id: row.id,
			project: row.project,
			title: row.title,
			context: row.context,
			alternatives: row.alternatives ? JSON.parse(row.alternatives) : null,
			tags: row.tags ? JSON.parse(row.tags) : null,
			status: row.status as DecisionStatus,
			links: row.links ? JSON.parse(row.links) : null,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
		};
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/server && npx vitest run src/adapters/persistence/pg.decision.repo.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/adapters/persistence/pg.decision.repo.ts packages/server/src/adapters/persistence/pg.decision.repo.test.ts
git commit -m "feat(server): add PgDecisionRepo with tests (#37)"
```

---

### Task 10: Make Services Async

**Files:**
- Modify: `packages/server/src/application/token.service.ts`
- Modify: `packages/server/src/application/team.service.ts`
- Modify: `packages/server/src/application/user.service.ts`
- Modify: `packages/server/src/application/project.service.ts`
- Modify: `packages/server/src/application/decision.service.ts`

- [ ] **Step 1: Update TokenService**

All methods that call repo become async with `await`:

```typescript
import type { Token } from "@logd/shared";
import { buildToken, generateRawToken, hashToken } from "../domain/token.js";
import type { TokenRepository } from "../ports/token.repository.js";

export class TokenService {
	constructor(private repo: TokenRepository) {}

	async create(userId: string, name: string): Promise<{ raw: string; token: Token }> {
		const raw = generateRawToken();
		const hash = hashToken(raw);
		const token = buildToken(userId, name, hash);
		await this.repo.create(token, hash);
		return { raw, token };
	}

	async createWithRaw(userId: string, name: string, rawToken: string): Promise<Token> {
		const hash = hashToken(rawToken);
		const token = buildToken(userId, name, hash);
		await this.repo.create(token, hash);
		return token;
	}

	async authenticate(rawToken: string): Promise<{ id: string } | null> {
		const hash = hashToken(rawToken);
		const result = await this.repo.findByHash(hash);
		return result ? { id: result.userId } : null;
	}

	async touch(rawToken: string): Promise<void> {
		const hash = hashToken(rawToken);
		await this.repo.touchLastUsed(hash);
	}

	async list(userId: string): Promise<Token[]> {
		return this.repo.listByUser(userId);
	}

	async revoke(tokenId: string): Promise<void> {
		await this.repo.delete(tokenId);
	}
}
```

- [ ] **Step 2: Update TeamService**

All methods async with `await`:

```typescript
import type { Team, TeamMember, TeamRole } from "@logd/shared";
import { buildTeam } from "../domain/team.js";
import type { TeamRepository } from "../ports/team.repository.js";
import { ConflictError } from "./project.service.js";

export class TeamService {
	constructor(private repo: TeamRepository) {}

	async create(name: string): Promise<Team> {
		if (await this.repo.findByName(name)) {
			throw new ConflictError(`Team '${name}' already exists`);
		}
		const team = buildTeam(name);
		await this.repo.create(team);
		return team;
	}

	async delete(teamId: string): Promise<void> {
		if (await this.repo.hasProjects(teamId)) {
			throw new BadRequestError("Cannot delete team with existing projects");
		}
		await this.repo.delete(teamId);
	}

	async listByUser(userId: string): Promise<Team[]> {
		return this.repo.listByUser(userId);
	}

	async addMember(teamId: string, userId: string, role: TeamRole): Promise<void> {
		await this.repo.addMember(teamId, userId, role);
	}

	async removeMember(teamId: string, userId: string): Promise<void> {
		await this.repo.removeMember(teamId, userId);
	}

	async updateMemberRole(teamId: string, userId: string, role: TeamRole): Promise<void> {
		await this.repo.updateMemberRole(teamId, userId, role);
	}

	async getMembership(
		userId: string,
		teamName: string,
	): Promise<{ teamId: string; role: TeamRole } | null> {
		return this.repo.getMembership(userId, teamName);
	}

	async listMembers(teamId: string): Promise<TeamMember[]> {
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

- [ ] **Step 3: Update UserService**

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

	async create(email: string, name: string): Promise<{ user: User; rawToken: string }> {
		if (await this.repo.findByEmail(email)) {
			throw new ConflictError(`User with email '${email}' already exists`);
		}
		const user = buildUser(email, name);
		await this.repo.create(user);
		const { raw } = await this.tokenService.create(user.id, "initial");
		return { user, rawToken: raw };
	}

	async listByTeam(teamId: string): Promise<User[]> {
		return this.repo.listByTeam(teamId);
	}
}
```

- [ ] **Step 4: Update ProjectService**

```typescript
import type { ProjectRepository } from "../ports/project.repository.js";

export class ProjectService {
	constructor(private repo: ProjectRepository) {}

	async create(name: string, description: string | null, teamId: string): Promise<void> {
		if (await this.repo.findByName(name)) {
			throw new ConflictError(`Project '${name}' already exists`);
		}
		await this.repo.create(name, description, teamId);
	}
}

export class ConflictError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ConflictError";
	}
}
```

- [ ] **Step 5: Update DecisionService**

Add `await` to all repo calls that were previously sync:

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
		await this.repo.create(decision, vector);
		return decision;
	}

	async get(id: string): Promise<Decision | null> {
		return this.repo.findById(id);
	}

	async update(id: string, input: UpdateDecisionInput): Promise<void> {
		const existing = await this.repo.findById(id);
		if (!existing) throw new NotFoundError(`Decision '${id}' not found`);

		const merged = { ...existing, ...input };
		const vector = await this.embedding.embed(buildDocumentTemplate(merged));
		await this.repo.update(id, input, vector);
	}

	async delete(id: string): Promise<void> {
		await this.repo.delete(id);
	}

	async list(options?: {
		project?: string;
		status?: DecisionStatus;
		limit?: number;
		teamId?: string;
	}): Promise<Decision[]> {
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
		const results = await this.repo.searchByVector(vector, limit, project, teamId);
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

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/application/
git commit -m "refactor(server): make all services async (#37)"
```

---

### Task 11: Update Route Handlers + Middleware

**Files:**
- Modify: `packages/server/src/adapters/http/routes/decisions.ts`
- Modify: `packages/server/src/adapters/http/routes/projects.ts`
- Modify: `packages/server/src/adapters/http/routes/teams.ts`
- Modify: `packages/server/src/adapters/http/routes/users.ts`
- Modify: `packages/server/src/adapters/http/routes/tokens.ts`
- Modify: `packages/server/src/adapters/http/middleware/auth.ts`
- Modify: `packages/server/src/adapters/http/middleware/team.ts`

- [ ] **Step 1: Update decisions.ts routes**

The `GET /:id`, `DELETE /:id`, and `GET /` handlers currently call sync service methods. Make them async and add `await`:

```typescript
// GET /:id — was sync, now async
router.get("/:id", async (c) => {
	const decision = await service.get(c.req.param("id"));
	if (!decision) {
		return c.text(`Decision '${c.req.param("id")}' not found`, 404);
	}
	return c.json(decision, 200);
});

// DELETE /:id — was sync, now async
router.delete("/:id", async (c) => {
	await service.delete(c.req.param("id"));
	return c.body(null, 204);
});

// GET / — was sync, now async
router.get("/", async (c) => {
	const project = c.req.query("project");
	const status = c.req.query("status");
	const limit = c.req.query("limit");

	const decisions = await service.list({
		project: project || undefined,
		status: (status as "active" | "superseded" | "deprecated") || undefined,
		limit: limit ? Number(limit) : undefined,
		teamId: c.get("teamId"),
	});
	return c.json(decisions, 200);
});
```

- [ ] **Step 2: Update projects.ts routes**

Add `await` to `service.create()`:

```typescript
router.post("/", async (c) => {
	const body = await c.req.json();
	if (!body.name) {
		return c.text("name is required", 400);
	}

	try {
		await service.create(body.name, body.description ?? null, c.get("teamId"));
		return c.body(null, 201);
	} catch (e) {
		if (e instanceof ConflictError) {
			return c.text(e.message, 409);
		}
		throw e;
	}
});
```

- [ ] **Step 3: Update teams.ts routes**

Add `await` to all `teamService.*()` calls:

```typescript
// POST / — add await to teamService.create()
const team = await teamService.create(body.name);

// GET / — make async, add await
router.get("/", async (c) => {
	const teams = await teamService.listByUser(c.get("userId"));
	return c.json(teams, 200);
});

// DELETE /:id — make async, add await
router.delete("/:id", adminOnly(), async (c) => {
	try {
		await teamService.delete(c.req.param("id"));
		return c.body(null, 204);
	} catch (e) {
		if (e instanceof BadRequestError) return c.text(e.message, 400);
		throw e;
	}
});

// POST /:id/members — add await
await teamService.addMember(c.req.param("id"), body.userId, body.role);

// DELETE /:id/members/:userId — make async, add await
router.delete("/:id/members/:userId", adminOnly(), async (c) => {
	await teamService.removeMember(c.req.param("id"), c.req.param("userId"));
	return c.body(null, 204);
});

// PATCH /:id/members/:userId — add await
await teamService.updateMemberRole(...)
```

- [ ] **Step 4: Update users.ts routes**

Add `await` to `userService.create()` and `userService.listByTeam()`:

```typescript
// POST / — add await
const { user, rawToken } = await userService.create(body.email, body.name);

// GET / — make async, add await
router.get("/", async (c) => {
	const users = await userService.listByTeam(c.get("teamId"));
	return c.json(users, 200);
});
```

- [ ] **Step 5: Update tokens.ts routes**

Add `await` to all `tokenService.*()` calls:

```typescript
// POST / — add await
const { raw } = await tokenService.create(c.get("userId"), body.name);

// GET / — make async, add await
router.get("/", async (c) => {
	const tokens = await tokenService.list(c.get("userId"));
	return c.json(tokens, 200);
});

// DELETE /:id — make async, add await
router.delete("/:id", async (c) => {
	await tokenService.revoke(c.req.param("id"));
	return c.body(null, 204);
});
```

- [ ] **Step 6: Update auth middleware**

Add `await` to `tokenService.authenticate()` and `tokenService.touch()`:

```typescript
export function createAuthMiddleware(
	tokenService: TokenService,
): MiddlewareHandler<AppEnv> {
	return bearerAuth({
		verifyToken: async (token, c) => {
			const result = await tokenService.authenticate(token);
			if (!result) return false;
			c.set("userId", result.id);
			await tokenService.touch(token);
			return true;
		},
	});
}
```

- [ ] **Step 7: Update team middleware**

Add `await` to `teamService.getMembership()`:

```typescript
const membership = await teamService.getMembership(userId, teamName);
```

- [ ] **Step 8: Commit**

```bash
git add packages/server/src/adapters/http/
git commit -m "refactor(server): make route handlers and middleware async (#37)"
```

---

### Task 12: Update Bootstrap + Health + Config + Index

**Files:**
- Modify: `packages/server/src/application/bootstrap.ts`
- Modify: `packages/server/src/adapters/http/routes/health.ts`
- Modify: `packages/server/src/config.ts`
- Modify: `packages/server/src/index.ts`
- Modify: `packages/server/src/adapters/http/app.ts`

- [ ] **Step 1: Rewrite bootstrap.ts**

Use port interfaces instead of concrete SQLite types. Make async. Remove raw `db.prepare` call — use Drizzle instead:

```typescript
import { isNull } from "drizzle-orm";
import * as schema from "../adapters/persistence/schema.js";
import type { Database } from "../adapters/persistence/database.js";
import { buildTeam } from "../domain/team.js";
import { buildUser } from "../domain/user.js";
import type { TeamRepository } from "../ports/team.repository.js";
import type { UserRepository } from "../ports/user.repository.js";
import type { TokenService } from "./token.service.js";

export interface BootstrapDeps {
	db: Database;
	userRepo: UserRepository;
	teamRepo: TeamRepository;
	tokenService: TokenService;
	apiToken: string | undefined;
}

export async function bootstrap(deps: BootstrapDeps): Promise<void> {
	const { db, userRepo, teamRepo, tokenService, apiToken } = deps;

	if (!(await userRepo.isEmpty()) || !apiToken) return;

	const admin = buildUser("admin@localhost", "Admin");
	await userRepo.create(admin);

	const team = buildTeam("default");
	await teamRepo.create(team);

	await teamRepo.addMember(team.id, admin.id, "admin");

	await tokenService.createWithRaw(admin.id, "bootstrap", apiToken);

	await db
		.update(schema.projects)
		.set({ teamId: team.id })
		.where(isNull(schema.projects.teamId));
}
```

- [ ] **Step 2: Update health.ts**

Replace `better-sqlite3` DB check with Drizzle:

```typescript
import { Hono } from "hono";
import type { Database } from "../../persistence/database.js";

export interface HealthDeps {
	db: Database;
	ollamaUrl: string;
}

export function healthRoutes(deps: HealthDeps): Hono {
	const router = new Hono();

	router.get("/health", (c) => {
		return c.json({ status: "ok" });
	});

	router.get("/health/ready", async (c) => {
		let dbStatus = "ok";
		let ollamaStatus = "ok";

		try {
			await deps.db.execute("SELECT 1");
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
			{
				status: ready ? "ready" : "not_ready",
				db: dbStatus,
				ollama: ollamaStatus,
			},
			ready ? 200 : 503,
		);
	});

	return router;
}
```

- [ ] **Step 3: Update config.ts**

```typescript
export interface Config {
	port: number;
	apiToken: string | undefined;
	databaseUrl: string;
	ollamaUrl: string;
	model: string;
}

export function loadConfig(): Config {
	return {
		port: Number(process.env.LOGD_PORT) || 3000,
		apiToken: process.env.LOGD_API_TOKEN,
		databaseUrl:
			process.env.DATABASE_URL ||
			"postgresql://logd:logd@localhost:5432/logd",
		ollamaUrl: process.env.LOGD_OLLAMA_URL || "http://localhost:11434",
		model: process.env.LOGD_MODEL || "qwen3-embedding:0.6b",
	};
}
```

- [ ] **Step 4: Update app.ts**

Change `HealthDeps` import from `better-sqlite3` to new Database type:

```typescript
// In app.ts, the HealthDeps type now uses Database from database.ts
// No code change needed — it re-exports from health.ts which already changed.
// But verify the import path is correct.
```

- [ ] **Step 5: Rewrite index.ts**

```typescript
import { serve } from "@hono/node-server";
import { OllamaProvider } from "./adapters/embedding/ollama.provider.js";
import { createApp } from "./adapters/http/app.js";
import { createDatabase } from "./adapters/persistence/database.js";
import { PgDecisionRepo } from "./adapters/persistence/pg.decision.repo.js";
import { PgProjectRepo } from "./adapters/persistence/pg.project.repo.js";
import { PgTeamRepo } from "./adapters/persistence/pg.team.repo.js";
import { PgTokenRepo } from "./adapters/persistence/pg.token.repo.js";
import { PgUserRepo } from "./adapters/persistence/pg.user.repo.js";
import { bootstrap } from "./application/bootstrap.js";
import { DecisionService } from "./application/decision.service.js";
import { ProjectService } from "./application/project.service.js";
import { TeamService } from "./application/team.service.js";
import { TokenService } from "./application/token.service.js";
import { UserService } from "./application/user.service.js";
import { loadConfig } from "./config.js";

async function main() {
	const config = loadConfig();

	if (!config.apiToken) {
		console.warn("LOGD_API_TOKEN not set — bootstrap will skip admin creation");
	}

	const db = await createDatabase(config.databaseUrl);
	const embeddingProvider = new OllamaProvider(config.ollamaUrl, config.model);

	const userRepo = new PgUserRepo(db);
	const teamRepo = new PgTeamRepo(db);
	const tokenRepo = new PgTokenRepo(db);
	const decisionRepo = new PgDecisionRepo(db);
	const projectRepo = new PgProjectRepo(db);

	const tokenService = new TokenService(tokenRepo);
	const teamService = new TeamService(teamRepo);
	const userService = new UserService(userRepo, tokenService);
	const decisionService = new DecisionService(decisionRepo, embeddingProvider);
	const projectService = new ProjectService(projectRepo);

	await bootstrap({ db, userRepo, teamRepo, tokenService, apiToken: config.apiToken });

	const app = createApp({
		tokenService,
		teamService,
		userService,
		decisionService,
		projectService,
		health: { db, ollamaUrl: config.ollamaUrl },
	});

	serve({ fetch: app.fetch, port: config.port }, (info) => {
		console.log(`logd server listening on http://localhost:${info.port}`);
	});
}

main().catch((err) => {
	console.error("Failed to start server:", err);
	process.exit(1);
});
```

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/application/bootstrap.ts packages/server/src/adapters/http/routes/health.ts packages/server/src/config.ts packages/server/src/index.ts packages/server/src/adapters/http/app.ts
git commit -m "feat(server): wire Postgres repos + async bootstrap + config (#37)"
```

---

### Task 13: Update All Tests

**Files:**
- Modify: All test files under `packages/server/src/`

- [ ] **Step 1: Create a shared test helper**

Write `packages/server/src/test-utils.ts`:

```typescript
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { createTestDatabase, type Database } from "./adapters/persistence/database.js";

export async function setupTestDb(): Promise<{ db: Database; pglite: PGlite }> {
	const pglite = await PGlite.create({ extensions: { vector } });
	const db = await createTestDatabase(pglite);
	return { db, pglite };
}
```

**Note:** `createTestDatabase` already runs migrations internally, so no separate `migrate()` call is needed.

- [ ] **Step 2: Update service tests**

Update each service test file to use async repos. Service tests that use mock repos (via `vi.fn()`) need their mocks to return Promises. For example, in `decision.service.test.ts`:

```typescript
// Mock repos return promises
const mockRepo: DecisionRepository = {
	create: vi.fn(async () => {}),
	findById: vi.fn(async () => null),
	update: vi.fn(async () => {}),
	delete: vi.fn(async () => {}),
	list: vi.fn(async () => []),
	searchByVector: vi.fn(async () => []),
};
```

Apply same pattern to all 5 service test files.

- [ ] **Step 3: Update route tests**

Route tests (`decisions.test.ts`, `projects.test.ts`, `teams.test.ts`, `users.test.ts`, `tokens.test.ts`) use `createInMemoryDatabase()` + SQLite repos. Replace with:

1. Import `setupTestDb` from test-utils
2. Replace `createInMemoryDatabase()` with `await setupTestDb()`
3. Replace `Sqlite*Repo` with `Pg*Repo`
4. Make `setup()` async
5. Update `bootstrap()` call to `await bootstrap()`
6. Add `afterEach` to close PGlite

Example for `decisions.test.ts`:

```typescript
import { afterEach, describe, expect, it, vi } from "vitest";
import { PgDecisionRepo } from "../../persistence/pg.decision.repo.js";
import { PgProjectRepo } from "../../persistence/pg.project.repo.js";
import { PgTeamRepo } from "../../persistence/pg.team.repo.js";
import { PgTokenRepo } from "../../persistence/pg.token.repo.js";
import { PgUserRepo } from "../../persistence/pg.user.repo.js";
import { setupTestDb } from "../../../test-utils.js";
import type { PGlite } from "@electric-sql/pglite";
// ... rest of imports

let currentPglite: PGlite;

afterEach(async () => {
	await currentPglite.close();
});

async function setup() {
	const { db, pglite } = await setupTestDb();
	currentPglite = pglite;
	const userRepo = new PgUserRepo(db);
	const teamRepo = new PgTeamRepo(db);
	const tokenRepo = new PgTokenRepo(db);
	const projectRepo = new PgProjectRepo(db);
	const decisionRepo = new PgDecisionRepo(db);
	// ... same wiring as before
	await bootstrap({ db, userRepo, teamRepo, tokenService, apiToken: API_TOKEN });
	// ...
}
```

- [ ] **Step 4: Update middleware tests**

`auth.test.ts` and `team.test.ts` — same pattern: use PGlite + Pg repos.

- [ ] **Step 5: Update bootstrap test**

Replace SQLite with PGlite + Pg repos. Make all calls async.

- [ ] **Step 6: Update health test**

Replace `better-sqlite3` mock with a Drizzle `Database` mock. The health route now calls `deps.db.execute("SELECT 1")` instead of `deps.db.prepare("SELECT 1").get()`.

- [ ] **Step 7: Delete old SQLite repo test files**

```bash
rm packages/server/src/adapters/persistence/sqlite.user.repo.test.ts
rm packages/server/src/adapters/persistence/sqlite.team.repo.test.ts
rm packages/server/src/adapters/persistence/sqlite.token.repo.test.ts
rm packages/server/src/adapters/persistence/sqlite.project.repo.test.ts
rm packages/server/src/adapters/persistence/sqlite.decision.repo.test.ts
```

- [ ] **Step 8: Run all tests**

Run: `cd packages/server && npx vitest run`
Expected: All tests pass.

- [ ] **Step 9: Commit**

```bash
git add -A packages/server/src/
git commit -m "test(server): migrate all tests to PGlite (#37)"
```

---

### Task 14: Delete Old SQLite Files

**Files:**
- Delete: `packages/server/src/adapters/persistence/sqlite.user.repo.ts`
- Delete: `packages/server/src/adapters/persistence/sqlite.team.repo.ts`
- Delete: `packages/server/src/adapters/persistence/sqlite.token.repo.ts`
- Delete: `packages/server/src/adapters/persistence/sqlite.project.repo.ts`
- Delete: `packages/server/src/adapters/persistence/sqlite.decision.repo.ts`

- [ ] **Step 1: Remove SQLite repo files**

```bash
rm packages/server/src/adapters/persistence/sqlite.user.repo.ts
rm packages/server/src/adapters/persistence/sqlite.team.repo.ts
rm packages/server/src/adapters/persistence/sqlite.token.repo.ts
rm packages/server/src/adapters/persistence/sqlite.project.repo.ts
rm packages/server/src/adapters/persistence/sqlite.decision.repo.ts
```

- [ ] **Step 2: Verify no remaining SQLite imports**

Run: `grep -r "sqlite" packages/server/src/ --include="*.ts" -l`
Expected: No files found.

Run: `grep -r "better-sqlite3" packages/server/src/ --include="*.ts" -l`
Expected: No files found.

- [ ] **Step 3: Run typecheck**

Run: `cd packages/server && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Run tests**

Run: `cd packages/server && npx vitest run`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A packages/server/src/
git commit -m "chore(server): remove SQLite repo implementations (#37)"
```

---

### Task 15: Update Docker Compose + Env + Dockerfile

**Files:**
- Modify: `docker-compose.yml`
- Modify: `.env.example`
- Modify: `Dockerfile`

- [ ] **Step 1: Update docker-compose.yml**

```yaml
services:
  postgres:
    image: pgvector/pgvector:pg17
    environment:
      POSTGRES_USER: logd
      POSTGRES_PASSWORD: logd
      POSTGRES_DB: logd
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U logd"]
      interval: 5s
      timeout: 3s
      retries: 5
    restart: unless-stopped

  server:
    build: .
    ports:
      - "${LOGD_PORT:-3000}:3000"
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      DATABASE_URL: postgresql://logd:logd@postgres:5432/logd
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
  pgdata:
  ollama-data:
```

- [ ] **Step 2: Update .env.example**

```
# logd server configuration
LOGD_PORT=3000
LOGD_API_TOKEN=changeme
DATABASE_URL=postgresql://logd:logd@localhost:5432/logd
# LOGD_OLLAMA_URL=http://localhost:11434  # Leave commented to use Ollama sidecar (--profile full). Set to your Ollama URL if running your own.
LOGD_MODEL=qwen3-embedding:0.6b
```

- [ ] **Step 3: Update Dockerfile**

Remove `build-essential` and `python3` (needed for `better-sqlite3` native build, not needed for `postgres`). The Dockerfile no longer needs native compilation support:

```dockerfile
# Stage 1: Build
FROM node:22-slim AS build

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
COPY --from=build /app/packages/server/drizzle/ packages/server/drizzle/
COPY --from=build /app/node_modules/ node_modules/
COPY --from=build /app/packages/server/node_modules/ packages/server/node_modules/

EXPOSE 3000
CMD ["node", "packages/server/dist/index.js"]
```

**Note:** Added `COPY --from=build /app/packages/server/drizzle/ packages/server/drizzle/` so migration files are available at runtime. Removed `build-essential` and `python3` since `postgres` (postgres.js) is pure JS.

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml .env.example Dockerfile
git commit -m "feat: Postgres docker-compose + env + slimmer Dockerfile (#37)"
```

---

### Task 16: Typecheck + Lint + Final Verification

- [ ] **Step 1: Run typecheck**

Run: `cd packages/server && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 2: Run lint**

Run: `npx biome check packages/server/src/`
Expected: No errors (or fix any that appear).

- [ ] **Step 3: Run all tests**

Run: `cd packages/server && npx vitest run`
Expected: All tests pass.

- [ ] **Step 4: Verify no SQLite remnants**

Run: `grep -r "sqlite\|better-sqlite3\|sqlite-vec" packages/server/ --include="*.ts" -l`
Expected: No files found.

- [ ] **Step 5: Commit any fixes**

```bash
git add -A packages/server/
git commit -m "chore(server): fix lint and type errors (#37)"
```
