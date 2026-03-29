import type { PGlite } from "@electric-sql/pglite";
import type { User } from "@logd/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setupTestDb } from "../../test-utils.js";
import type { Database } from "./database.js";
import { PgUserRepo } from "./pg.user.repo.js";
import * as schema from "./schema.js";

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
