import { beforeEach, describe, expect, it } from "vitest";
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
		expect(repo.findByName("test-project")).toBe(true);
	});

	it("findByName returns false for unknown project", () => {
		expect(repo.findByName("nope")).toBe(false);
	});

	it("findByName is case-insensitive", () => {
		repo.create("MyProject", null, "t-1");
		expect(repo.findByName("myproject")).toBe(true);
	});

	it("throws on duplicate project name", () => {
		repo.create("dup", null, "t-1");
		expect(() => repo.create("dup", null, "t-1")).toThrow();
	});
});
