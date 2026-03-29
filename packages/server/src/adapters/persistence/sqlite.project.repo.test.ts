import { beforeEach, describe, expect, it } from "vitest";
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
