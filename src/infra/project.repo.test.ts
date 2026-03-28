import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Project } from "../core/types.js";
import { createDatabase } from "./db.js";
import { ProjectRepo } from "./project.repo.js";

describe("ProjectRepo", () => {
	let db: Database.Database;
	let repo: ProjectRepo;
	let tempDir: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "logd-test-"));
		db = createDatabase(join(tempDir, "test.db"));
		repo = new ProjectRepo(db);
	});

	afterEach(() => {
		db.close();
		rmSync(tempDir, { recursive: true, force: true });
	});

	function makeProject(overrides: Partial<Project> = {}): Project {
		return {
			id: "test-uuid",
			name: "myproject",
			description: null,
			createdAt: "2026-01-01T00:00:00.000Z",
			...overrides,
		};
	}

	it("create stores a project and findByName retrieves it", () => {
		repo.create(makeProject());
		const found = repo.findByName("myproject");
		expect(found).not.toBeNull();
		expect(found?.id).toBe("test-uuid");
		expect(found?.name).toBe("myproject");
		expect(found?.description).toBeNull();
		expect(found?.createdAt).toBe("2026-01-01T00:00:00.000Z");
	});

	it("findByName is case-insensitive", () => {
		repo.create(makeProject({ name: "myproject" }));
		expect(repo.findByName("MyProject")).not.toBeNull();
		expect(repo.findByName("MYPROJECT")).not.toBeNull();
	});

	it("findByName trims whitespace", () => {
		repo.create(makeProject({ name: "myproject" }));
		expect(repo.findByName("  myproject  ")).not.toBeNull();
	});

	it("findByName returns null for non-existent project", () => {
		expect(repo.findByName("doesnotexist")).toBeNull();
	});

	it("list returns all projects ordered by name", () => {
		repo.create(makeProject({ id: "1", name: "zebra" }));
		repo.create(makeProject({ id: "2", name: "alpha" }));
		repo.create(makeProject({ id: "3", name: "middle" }));

		const projects = repo.list();
		expect(projects).toHaveLength(3);
		expect(projects[0].name).toBe("alpha");
		expect(projects[1].name).toBe("middle");
		expect(projects[2].name).toBe("zebra");
	});

	it("list returns empty array when no projects", () => {
		expect(repo.list()).toEqual([]);
	});

	it("create with duplicate name throws", () => {
		repo.create(makeProject({ id: "1", name: "myproject" }));
		expect(() =>
			repo.create(makeProject({ id: "2", name: "myproject" })),
		).toThrow();
	});

	it("stores and retrieves description", () => {
		repo.create(makeProject({ description: "A test project" }));
		const found = repo.findByName("myproject");
		expect(found?.description).toBe("A test project");
	});
});
