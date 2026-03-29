import type { PGlite } from "@electric-sql/pglite";
import type { Decision } from "@logd/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setupTestDb } from "../../test-utils.js";
import type { Database } from "./database.js";
import { PgDecisionRepo } from "./pg.decision.repo.js";
import { PgProjectRepo } from "./pg.project.repo.js";
import * as schema from "./schema.js";

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

async function insertTeam(db: Database, id = "t-1", name = "acme") {
	await db.insert(schema.teams).values({
		id,
		name,
		createdAt: "2026-01-01T00:00:00.000Z",
	});
}

describe("PgDecisionRepo", () => {
	let db: Database;
	let repo: PgDecisionRepo;
	let pglite: PGlite;

	beforeEach(async () => {
		({ db, pglite } = await setupTestDb());
		repo = new PgDecisionRepo(db);
		await insertTeam(db);
		const projectRepo = new PgProjectRepo(db);
		await projectRepo.create("proj", null, "t-1");
	});

	afterEach(async () => {
		await pglite.close();
	});

	it("create + findById round-trips", async () => {
		const d = makeDecision();
		await repo.create(d, fakeEmbedding);
		const found = await repo.findById("d-1");
		expect(found).not.toBeNull();
		expect(found?.title).toBe("Use Hono");
		expect(found?.alternatives).toEqual(["Express", "Fastify"]);
		expect(found?.tags).toEqual(["backend"]);
		expect(found?.links).toBeNull();
	});

	it("findById returns null for missing", async () => {
		expect(await repo.findById("nope")).toBeNull();
	});

	it("update changes fields and updatedAt", async () => {
		await repo.create(makeDecision(), fakeEmbedding);
		await repo.update("d-1", { title: "Use Fastify" }, fakeEmbedding);
		const found = await repo.findById("d-1");
		expect(found).not.toBeNull();
		expect(found?.title).toBe("Use Fastify");
		expect(found?.updatedAt).not.toBe("2026-01-01T00:00:00.000Z");
	});

	it("delete removes from both tables", async () => {
		await repo.create(makeDecision(), fakeEmbedding);
		await repo.delete("d-1");
		expect(await repo.findById("d-1")).toBeNull();
	});

	it("list filters by project", async () => {
		await repo.create(makeDecision({ id: "d-1" }), fakeEmbedding);
		const results = await repo.list({ project: "proj" });
		expect(results).toHaveLength(1);
		const empty = await repo.list({ project: "other" });
		expect(empty).toHaveLength(0);
	});

	it("list filters by status", async () => {
		await repo.create(
			makeDecision({ id: "d-1", status: "active" }),
			fakeEmbedding,
		);
		await repo.create(
			makeDecision({ id: "d-2", status: "deprecated" }),
			fakeEmbedding,
		);
		const results = await repo.list({ status: "active" });
		expect(results).toHaveLength(1);
		expect(results[0].id).toBe("d-1");
	});

	it("list respects limit", async () => {
		await repo.create(makeDecision({ id: "d-1" }), fakeEmbedding);
		await repo.create(makeDecision({ id: "d-2" }), fakeEmbedding);
		const results = await repo.list({ limit: 1 });
		expect(results).toHaveLength(1);
	});

	it("list filters by teamId", async () => {
		await insertTeam(db, "t-2", "other-team");
		const projectRepo = new PgProjectRepo(db);
		await projectRepo.create("other-proj", null, "t-2");
		await repo.create(
			makeDecision({ id: "d-1", project: "proj" }),
			fakeEmbedding,
		);
		await repo.create(
			makeDecision({ id: "d-2", project: "other-proj" }),
			fakeEmbedding,
		);
		const results = await repo.list({ teamId: "t-1" });
		expect(results).toHaveLength(1);
		expect(results[0].id).toBe("d-1");
	});

	it("searchByVector returns results sorted by score", async () => {
		await repo.create(makeDecision({ id: "d-1" }), fakeEmbedding);
		const results = await repo.searchByVector(fakeEmbedding, 10, "proj");
		expect(results.length).toBeGreaterThan(0);
		expect(results[0].decision.id).toBe("d-1");
		expect(results[0].score).toBeGreaterThan(0);
	});

	it("searchByVector filters by project", async () => {
		await repo.create(makeDecision({ id: "d-1" }), fakeEmbedding);
		const results = await repo.searchByVector(fakeEmbedding, 10, "other");
		expect(results).toHaveLength(0);
	});

	it("searchByVector filters by teamId", async () => {
		await insertTeam(db, "t-2", "other-team");
		const projectRepo = new PgProjectRepo(db);
		await projectRepo.create("other-proj", null, "t-2");
		await repo.create(
			makeDecision({ id: "d-1", project: "proj" }),
			fakeEmbedding,
		);
		await repo.create(
			makeDecision({ id: "d-2", project: "other-proj" }),
			fakeEmbedding,
		);
		const results = await repo.searchByVector(
			fakeEmbedding,
			10,
			undefined,
			"t-1",
		);
		expect(results.every((r) => r.decision.project === "proj")).toBe(true);
	});
});
