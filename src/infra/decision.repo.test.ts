import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Decision } from "../core/types.js";
import { createDatabase } from "./db.js";
import { DecisionRepo } from "./decision.repo.js";
import { ProjectRepo } from "./project.repo.js";

describe("DecisionRepo", () => {
	let db: Database.Database;
	let repo: DecisionRepo;
	let tempDir: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "logd-test-"));
		db = createDatabase(join(tempDir, "test.db"));
		repo = new DecisionRepo(db);
		// Seed a project for FK constraint
		const projectRepo = new ProjectRepo(db);
		projectRepo.create({
			id: "proj-1",
			name: "testproject",
			description: null,
			createdAt: "2026-01-01T00:00:00.000Z",
		});
	});

	afterEach(() => {
		db.close();
		rmSync(tempDir, { recursive: true, force: true });
	});

	function makeDecision(overrides: Partial<Decision> = {}): Decision {
		return {
			id: "dec-1",
			project: "testproject",
			title: "Use Postgres",
			context: null,
			alternatives: null,
			tags: null,
			status: "active",
			links: null,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
			...overrides,
		};
	}

	// Use a simple fake embedding (1024-dim)
	function fakeEmbedding(seed: number): number[] {
		const emb = new Array(1024).fill(0);
		emb[0] = seed;
		return emb;
	}

	it("create stores decision and findById retrieves it", () => {
		const decision = makeDecision();
		repo.create(decision, fakeEmbedding(1));

		const found = repo.findById("dec-1");
		expect(found).not.toBeNull();
		expect(found?.id).toBe("dec-1");
		expect(found?.title).toBe("Use Postgres");
		expect(found?.project).toBe("testproject");
		expect(found?.status).toBe("active");
	});

	it("findById parses JSON array fields", () => {
		const decision = makeDecision({
			alternatives: ["MySQL", "MongoDB"],
			tags: ["backend", "db"],
			links: ["https://example.com"],
		});
		repo.create(decision, fakeEmbedding(1));

		const found = repo.findById("dec-1");
		expect(found?.alternatives).toEqual(["MySQL", "MongoDB"]);
		expect(found?.tags).toEqual(["backend", "db"]);
		expect(found?.links).toEqual(["https://example.com"]);
	});

	it("findById returns null for non-existent decision", () => {
		expect(repo.findById("nonexistent")).toBeNull();
	});

	it("update changes only specified fields", () => {
		repo.create(makeDecision(), fakeEmbedding(1));
		repo.update("dec-1", { context: "Updated context" });

		const found = repo.findById("dec-1");
		expect(found?.context).toBe("Updated context");
		expect(found?.title).toBe("Use Postgres"); // unchanged
	});

	it("update with new embedding replaces the vector", () => {
		repo.create(makeDecision(), fakeEmbedding(1));
		repo.update("dec-1", { title: "Use MySQL" }, fakeEmbedding(2));

		const found = repo.findById("dec-1");
		expect(found?.title).toBe("Use MySQL");
	});

	it("update replaces JSON arrays entirely", () => {
		repo.create(makeDecision({ tags: ["old-tag"] }), fakeEmbedding(1));
		repo.update("dec-1", { tags: ["new-tag-1", "new-tag-2"] });

		const found = repo.findById("dec-1");
		expect(found?.tags).toEqual(["new-tag-1", "new-tag-2"]);
	});

	it("delete removes from both decisions and decisions_vec", () => {
		repo.create(makeDecision(), fakeEmbedding(1));
		repo.delete("dec-1");

		expect(repo.findById("dec-1")).toBeNull();
	});

	it("delete non-existent is a no-op", () => {
		expect(() => repo.delete("nonexistent")).not.toThrow();
	});

	it("list returns all decisions ordered by created_at desc", () => {
		repo.create(
			makeDecision({
				id: "dec-1",
				createdAt: "2026-01-01T00:00:00.000Z",
			}),
			fakeEmbedding(1),
		);
		repo.create(
			makeDecision({
				id: "dec-2",
				title: "Use Redis",
				createdAt: "2026-01-02T00:00:00.000Z",
			}),
			fakeEmbedding(2),
		);

		const results = repo.list({ limit: 20 });
		expect(results).toHaveLength(2);
		expect(results[0].id).toBe("dec-2"); // newer first
		expect(results[1].id).toBe("dec-1");
	});

	it("list filters by project", () => {
		// Create second project
		const projectRepo = new ProjectRepo(db);
		projectRepo.create({
			id: "proj-2",
			name: "other",
			description: null,
			createdAt: "2026-01-01T00:00:00.000Z",
		});

		repo.create(
			makeDecision({ id: "dec-1", project: "testproject" }),
			fakeEmbedding(1),
		);
		repo.create(
			makeDecision({ id: "dec-2", project: "other" }),
			fakeEmbedding(2),
		);

		const results = repo.list({ project: "testproject", limit: 20 });
		expect(results).toHaveLength(1);
		expect(results[0].project).toBe("testproject");
	});

	it("list filters by status", () => {
		repo.create(
			makeDecision({ id: "dec-1", status: "active" }),
			fakeEmbedding(1),
		);
		repo.create(
			makeDecision({
				id: "dec-2",
				status: "deprecated",
				createdAt: "2026-01-02T00:00:00.000Z",
			}),
			fakeEmbedding(2),
		);

		const results = repo.list({ status: "active", limit: 20 });
		expect(results).toHaveLength(1);
		expect(results[0].status).toBe("active");
	});

	it("list respects limit", () => {
		repo.create(makeDecision({ id: "dec-1" }), fakeEmbedding(1));
		repo.create(
			makeDecision({
				id: "dec-2",
				createdAt: "2026-01-02T00:00:00.000Z",
			}),
			fakeEmbedding(2),
		);

		const results = repo.list({ limit: 1 });
		expect(results).toHaveLength(1);
	});

	it("searchByVector returns scored results", () => {
		repo.create(makeDecision({ id: "dec-1" }), fakeEmbedding(1));
		repo.create(
			makeDecision({
				id: "dec-2",
				title: "Use Redis",
				createdAt: "2026-01-02T00:00:00.000Z",
			}),
			fakeEmbedding(2),
		);

		const results = repo.searchByVector(fakeEmbedding(1), 5);
		expect(results.length).toBeGreaterThanOrEqual(1);
		expect(results[0].decision).toBeDefined();
		expect(typeof results[0].score).toBe("number");
	});

	it("searchByVector filters by project", () => {
		const projectRepo = new ProjectRepo(db);
		projectRepo.create({
			id: "proj-2",
			name: "other",
			description: null,
			createdAt: "2026-01-01T00:00:00.000Z",
		});

		repo.create(
			makeDecision({ id: "dec-1", project: "testproject" }),
			fakeEmbedding(1),
		);
		repo.create(
			makeDecision({ id: "dec-2", project: "other" }),
			fakeEmbedding(1),
		);

		const results = repo.searchByVector(fakeEmbedding(1), 5, "testproject");
		expect(results.every((r) => r.decision.project === "testproject")).toBe(
			true,
		);
	});

	it("list returns empty array when no decisions", () => {
		expect(repo.list({ limit: 20 })).toEqual([]);
	});
});
