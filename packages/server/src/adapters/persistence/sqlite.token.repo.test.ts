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
