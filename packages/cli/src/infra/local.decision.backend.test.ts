import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Decision, IDecisionRepo } from "../core/types.js";
import { LocalDecisionBackend } from "./local.decision.backend.js";

function makeDecision(id: string): Decision {
	return {
		id,
		project: "test",
		title: "Test",
		context: null,
		alternatives: null,
		tags: null,
		status: "active",
		links: null,
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
	};
}

describe("LocalDecisionBackend", () => {
	let repo: IDecisionRepo;
	let backend: LocalDecisionBackend;

	beforeEach(() => {
		repo = {
			create: vi.fn(),
			findById: vi.fn(() => makeDecision("d1")),
			update: vi.fn(),
			delete: vi.fn(),
			list: vi.fn(() => [makeDecision("d1")]),
			searchByVector: vi.fn(() => [
				{ decision: makeDecision("d1"), score: 0.9 },
			]),
		};
		backend = new LocalDecisionBackend(repo);
	});

	it("create delegates to repo and returns promise", async () => {
		const decision = makeDecision("d1");
		await backend.create(decision, [0.1]);
		expect(repo.create).toHaveBeenCalledWith(decision, [0.1]);
	});

	it("findById delegates to repo", async () => {
		const result = await backend.findById("d1");
		expect(result).toEqual(makeDecision("d1"));
	});

	it("update delegates to repo", async () => {
		await backend.update("d1", { title: "New" }, [0.2]);
		expect(repo.update).toHaveBeenCalledWith("d1", { title: "New" }, [0.2]);
	});

	it("delete delegates to repo", async () => {
		await backend.delete("d1");
		expect(repo.delete).toHaveBeenCalledWith("d1");
	});

	it("list delegates to repo", async () => {
		const results = await backend.list({ project: "test" });
		expect(results).toHaveLength(1);
	});

	it("searchByVector delegates to repo", async () => {
		const results = await backend.searchByVector([0.1], 5, "test");
		expect(results).toHaveLength(1);
		expect(results[0].score).toBe(0.9);
	});
});
