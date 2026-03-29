import type { PGlite } from "@electric-sql/pglite";
import type { Token } from "@logd/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setupTestDb } from "../../test-utils.js";
import type { Database } from "./database.js";
import { PgTokenRepo } from "./pg.token.repo.js";
import * as schema from "./schema.js";

function makeToken(overrides?: Partial<Token>): Token {
	return {
		id: "tok-1",
		userId: "u-1",
		name: "my-token",
		createdAt: "2026-01-01T00:00:00.000Z",
		lastUsedAt: null,
		...overrides,
	};
}

async function insertUser(db: Database, id = "u-1") {
	await db.insert(schema.users).values({
		id,
		email: `${id}@example.com`,
		name: "Test",
		createdAt: "2026-01-01T00:00:00.000Z",
	});
}

describe("PgTokenRepo", () => {
	let db: Database;
	let repo: PgTokenRepo;
	let pglite: PGlite;

	beforeEach(async () => {
		({ db, pglite } = await setupTestDb());
		repo = new PgTokenRepo(db);
		await insertUser(db);
	});

	afterEach(async () => {
		await pglite.close();
	});

	it("create + findByHash round-trips", async () => {
		const token = makeToken();
		await repo.create(token, "hash-1");
		const found = await repo.findByHash("hash-1");
		expect(found).not.toBeNull();
		expect(found?.token.id).toBe("tok-1");
		expect(found?.token.name).toBe("my-token");
		expect(found?.userId).toBe("u-1");
	});

	it("findByHash returns null for missing", async () => {
		expect(await repo.findByHash("no-such-hash")).toBeNull();
	});

	it("listByUser returns tokens ordered by createdAt", async () => {
		await repo.create(
			makeToken({
				id: "tok-2",
				createdAt: "2026-01-03T00:00:00.000Z",
				name: "second",
			}),
			"hash-2",
		);
		await repo.create(
			makeToken({
				id: "tok-1",
				createdAt: "2026-01-01T00:00:00.000Z",
				name: "first",
			}),
			"hash-1",
		);
		await repo.create(
			makeToken({
				id: "tok-3",
				createdAt: "2026-01-02T00:00:00.000Z",
				name: "middle",
			}),
			"hash-3",
		);

		const tokens = await repo.listByUser("u-1");
		expect(tokens).toHaveLength(3);
		expect(tokens[0].name).toBe("first");
		expect(tokens[1].name).toBe("middle");
		expect(tokens[2].name).toBe("second");
	});

	it("delete removes token", async () => {
		await repo.create(makeToken(), "hash-1");
		await repo.delete("tok-1");
		expect(await repo.findByHash("hash-1")).toBeNull();
	});

	it("touchLastUsed updates timestamp", async () => {
		await repo.create(makeToken(), "hash-1");
		expect((await repo.findByHash("hash-1"))?.token.lastUsedAt).toBeNull();

		await repo.touchLastUsed("hash-1");
		const found = await repo.findByHash("hash-1");
		expect(found?.token.lastUsedAt).not.toBeNull();
	});
});
