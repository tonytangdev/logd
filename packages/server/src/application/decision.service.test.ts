import type { Decision, SearchResult } from "@logd/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DecisionRepository } from "../ports/decision.repository.js";
import type { EmbeddingProvider } from "../ports/embedding.provider.js";
import { DecisionService } from "./decision.service.js";

const fakeEmbedding = [0.1, 0.2, 0.3];

function mockDecisionRepo(): DecisionRepository {
	const store = new Map<string, Decision>();
	return {
		create: vi.fn(async (d: Decision) => {
			store.set(d.id, d);
		}),
		findById: vi.fn(async (id: string) => store.get(id) ?? null),
		update: vi.fn(async () => {}),
		delete: vi.fn(async (id: string) => {
			store.delete(id);
		}),
		list: vi.fn(async () => [...store.values()]),
		searchByVector: vi.fn(async () => []),
	};
}

function mockEmbedding(): EmbeddingProvider {
	return { embed: vi.fn(async () => fakeEmbedding) };
}

describe("DecisionService", () => {
	let service: DecisionService;
	let repo: ReturnType<typeof mockDecisionRepo>;
	let embedding: ReturnType<typeof mockEmbedding>;

	beforeEach(() => {
		repo = mockDecisionRepo();
		embedding = mockEmbedding();
		service = new DecisionService(repo, embedding);
	});

	it("create builds decision, embeds, stores, returns", async () => {
		const result = await service.create({ project: "proj", title: "Use Hono" });
		expect(result.title).toBe("Use Hono");
		expect(result.id).toBeDefined();
		expect(repo.create).toHaveBeenCalled();
		expect(embedding.embed).toHaveBeenCalled();
	});

	it("get returns decision by id", async () => {
		const created = await service.create({ project: "proj", title: "Test" });
		const found = await service.get(created.id);
		expect(found).not.toBeNull();
	});

	it("get returns null for missing", async () => {
		expect(await service.get("nope")).toBeNull();
	});

	it("update calls repo.update with new embedding", async () => {
		const created = await service.create({ project: "proj", title: "Test" });
		await service.update(created.id, { title: "Updated" });
		expect(repo.update).toHaveBeenCalled();
		expect(embedding.embed).toHaveBeenCalledTimes(2); // create + update
	});

	it("update throws NotFoundError for missing decision", async () => {
		await expect(service.update("nope", { title: "X" })).rejects.toThrow(
			"not found",
		);
	});

	it("delete calls repo.delete", async () => {
		await service.delete("d-1");
		expect(repo.delete).toHaveBeenCalledWith("d-1");
	});

	it("list delegates to repo", async () => {
		await service.list({ project: "proj" });
		expect(repo.list).toHaveBeenCalledWith({ project: "proj" });
	});

	it("list passes teamId to repo", async () => {
		await service.list({ teamId: "t-1" });
		expect(repo.list).toHaveBeenCalledWith({ teamId: "t-1" });
	});

	it("search embeds query then calls searchByVector, filters by threshold", async () => {
		const mockResults: SearchResult[] = [
			{
				decision: {
					id: "d-1",
					project: "proj",
					title: "T",
					context: null,
					alternatives: null,
					tags: null,
					status: "active",
					links: null,
					createdAt: "",
					updatedAt: "",
				},
				score: 0.9,
			},
			{
				decision: {
					id: "d-2",
					project: "proj",
					title: "T2",
					context: null,
					alternatives: null,
					tags: null,
					status: "active",
					links: null,
					createdAt: "",
					updatedAt: "",
				},
				score: 0.3,
			},
		];
		(repo.searchByVector as ReturnType<typeof vi.fn>).mockResolvedValue(
			mockResults,
		);

		const results = await service.search("proj", "query", 0.5, 10);
		expect(results).toHaveLength(1);
		expect(results[0].score).toBe(0.9);
		expect(embedding.embed).toHaveBeenCalled();
	});

	it("search passes teamId to searchByVector", async () => {
		await service.search("proj", "query", 0.5, 10, "t-1");
		expect(repo.searchByVector).toHaveBeenCalledWith(
			fakeEmbedding,
			10,
			"proj",
			"t-1",
		);
	});
});
