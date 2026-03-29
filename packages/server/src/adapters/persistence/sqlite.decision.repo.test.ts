import { describe, it, expect, beforeEach } from "vitest";
import type { Decision } from "@logd/shared";
import { createInMemoryDatabase } from "./database.js";
import { SqliteDecisionRepo } from "./sqlite.decision.repo.js";
import { SqliteProjectRepo } from "./sqlite.project.repo.js";

function makeDecision(overrides?: Partial<Decision>): Decision {
	return {
		id: "d-1",
		project: "proj",
		title: "Use Hono",
		context: "Need HTTP framework",
		alternatives: ["Express", "Fastify"],
		tags: ["backend"],
		status: "active",
		links: null,
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		...overrides,
	};
}

const fakeEmbedding = Array.from({ length: 1024 }, () => Math.random());

describe("SqliteDecisionRepo", () => {
	let repo: SqliteDecisionRepo;

	beforeEach(() => {
		const db = createInMemoryDatabase();
		const projectRepo = new SqliteProjectRepo(db);
		projectRepo.create("proj", null);
		repo = new SqliteDecisionRepo(db);
	});

	it("create + findById round-trips", () => {
		const d = makeDecision();
		repo.create(d, fakeEmbedding);
		const found = repo.findById("d-1");
		expect(found).not.toBeNull();
		expect(found!.title).toBe("Use Hono");
		expect(found!.alternatives).toEqual(["Express", "Fastify"]);
	});

	it("findById returns null for missing", () => {
		expect(repo.findById("nope")).toBeNull();
	});

	it("update changes fields and updatedAt", () => {
		repo.create(makeDecision(), fakeEmbedding);
		repo.update("d-1", { title: "Use Fastify" }, fakeEmbedding);
		const found = repo.findById("d-1")!;
		expect(found.title).toBe("Use Fastify");
		expect(found.updatedAt).not.toBe("2026-01-01T00:00:00.000Z");
	});

	it("delete removes from both tables", () => {
		repo.create(makeDecision(), fakeEmbedding);
		repo.delete("d-1");
		expect(repo.findById("d-1")).toBeNull();
	});

	it("list filters by project", () => {
		repo.create(makeDecision({ id: "d-1" }), fakeEmbedding);
		const results = repo.list({ project: "proj" });
		expect(results).toHaveLength(1);
		const empty = repo.list({ project: "other" });
		expect(empty).toHaveLength(0);
	});

	it("list filters by status", () => {
		repo.create(makeDecision({ id: "d-1", status: "active" }), fakeEmbedding);
		repo.create(
			makeDecision({ id: "d-2", status: "deprecated" }),
			fakeEmbedding,
		);
		const results = repo.list({ status: "active" });
		expect(results).toHaveLength(1);
		expect(results[0].id).toBe("d-1");
	});

	it("list respects limit", () => {
		repo.create(makeDecision({ id: "d-1" }), fakeEmbedding);
		repo.create(makeDecision({ id: "d-2" }), fakeEmbedding);
		const results = repo.list({ limit: 1 });
		expect(results).toHaveLength(1);
	});

	it("searchByVector returns results sorted by score", () => {
		repo.create(makeDecision({ id: "d-1" }), fakeEmbedding);
		const results = repo.searchByVector(fakeEmbedding, 10, "proj");
		expect(results.length).toBeGreaterThan(0);
		expect(results[0].decision.id).toBe("d-1");
		expect(results[0].score).toBeGreaterThan(0);
	});

	it("searchByVector filters by project", () => {
		repo.create(makeDecision({ id: "d-1" }), fakeEmbedding);
		const results = repo.searchByVector(fakeEmbedding, 10, "other");
		expect(results).toHaveLength(0);
	});
});
