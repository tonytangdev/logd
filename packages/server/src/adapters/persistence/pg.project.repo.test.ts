import type { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setupTestDb } from "../../test-utils.js";
import type { Database } from "./database.js";
import { PgProjectRepo } from "./pg.project.repo.js";
import * as schema from "./schema.js";

async function insertTeam(db: Database, id = "t-1", name = "acme") {
	await db.insert(schema.teams).values({
		id,
		name,
		createdAt: "2026-01-01T00:00:00.000Z",
	});
}

describe("PgProjectRepo", () => {
	let db: Database;
	let repo: PgProjectRepo;
	let pglite: PGlite;

	beforeEach(async () => {
		({ db, pglite } = await setupTestDb());
		repo = new PgProjectRepo(db);
		await insertTeam(db);
	});

	afterEach(async () => {
		await pglite.close();
	});

	it("create + findByName returns true", async () => {
		await repo.create("my-project", "a description", "t-1");
		expect(await repo.findByName("my-project")).toBe(true);
	});

	it("findByName returns false for missing", async () => {
		expect(await repo.findByName("nope")).toBe(false);
	});

	it("findByName is case-insensitive", async () => {
		await repo.create("My-Project", null, "t-1");
		expect(await repo.findByName("my-project")).toBe(true);
		expect(await repo.findByName("MY-PROJECT")).toBe(true);
	});

	it("throws on duplicate name", async () => {
		await repo.create("dup", null, "t-1");
		await expect(repo.create("dup", null, "t-1")).rejects.toThrow();
	});
});
