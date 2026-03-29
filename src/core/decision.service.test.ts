import { beforeEach, describe, expect, it, vi } from "vitest";
import { BackendFactory } from "./backend.factory.js";
import { DecisionService } from "./decision.service.js";
import { EmbeddingService } from "./embedding.service.js";
import type {
	Decision,
	IDecisionRepo,
	IEmbeddingClient,
	IProjectRepo,
	Project,
} from "./types.js";
import { CredentialStore } from "../infra/credentials.js";

function createMockProjectRepo(projects: Project[] = []): IProjectRepo {
	return {
		create: vi.fn(),
		findByName: vi.fn(
			(name: string) => projects.find((p) => p.name === name) ?? null,
		),
		list: vi.fn(() => projects),
	};
}

function createMockDecisionRepo(): IDecisionRepo {
	const store = new Map<string, { decision: Decision; embedding: number[] }>();
	return {
		create: vi.fn((decision: Decision, embedding: number[]) => {
			store.set(decision.id, { decision, embedding });
		}),
		findById: vi.fn((id: string) => store.get(id)?.decision ?? null),
		update: vi.fn(),
		delete: vi.fn(),
		list: vi.fn(() => Array.from(store.values()).map((v) => v.decision)),
		searchByVector: vi.fn(() => []),
	};
}

function createMockEmbeddingClient(): IEmbeddingClient {
	return { embed: vi.fn().mockResolvedValue(new Array(1024).fill(0.1)) };
}

const testProject: Project = {
	id: "proj-1",
	name: "testproject",
	description: null,
	createdAt: "2026-01-01T00:00:00.000Z",
	server: null,
	team: null,
};

describe("DecisionService", () => {
	let decisionRepo: IDecisionRepo;
	let projectRepo: IProjectRepo;
	let embeddingClient: IEmbeddingClient;
	let embeddingService: EmbeddingService;
	let credentialStore: CredentialStore;
	let backendFactory: BackendFactory;
	let service: DecisionService;

	beforeEach(() => {
		decisionRepo = createMockDecisionRepo();
		projectRepo = createMockProjectRepo([testProject]);
		embeddingClient = createMockEmbeddingClient();
		embeddingService = new EmbeddingService(embeddingClient);
		credentialStore = new CredentialStore("/tmp/fake-credentials.json");
		backendFactory = new BackendFactory(decisionRepo, credentialStore, embeddingService);
		service = new DecisionService(projectRepo, backendFactory);
	});

	describe("create", () => {
		it("creates a decision with generated UUID", async () => {
			const result = await service.create({
				project: "testproject",
				title: "Use Postgres",
			});
			expect(result.id).toBeDefined();
			expect(result.id.length).toBeGreaterThan(0);
			expect(result.title).toBe("Use Postgres");
			expect(result.project).toBe("testproject");
		});

		it("sets default status to active", async () => {
			const result = await service.create({
				project: "testproject",
				title: "Use Postgres",
			});
			expect(result.status).toBe("active");
		});

		it("sets createdAt and updatedAt", async () => {
			const result = await service.create({
				project: "testproject",
				title: "Use Postgres",
			});
			expect(result.createdAt).toBeDefined();
			expect(result.updatedAt).toBeDefined();
		});

		it("computes embedding and passes to repo", async () => {
			await service.create({ project: "testproject", title: "Use Postgres" });
			expect(embeddingClient.embed).toHaveBeenCalled();
			expect(decisionRepo.create).toHaveBeenCalledWith(
				expect.objectContaining({ title: "Use Postgres" }),
				expect.any(Array),
			);
		});

		it("throws when project does not exist", async () => {
			await expect(
				service.create({ project: "nonexistent", title: "Test" }),
			).rejects.toThrow("Project 'nonexistent' not found");
		});

		it("includes available projects in error message", async () => {
			await expect(
				service.create({ project: "nonexistent", title: "Test" }),
			).rejects.toThrow("Available projects: testproject");
		});

		it("shows 'none' when no projects exist", async () => {
			projectRepo = createMockProjectRepo([]);
			backendFactory = new BackendFactory(decisionRepo, credentialStore, embeddingService);
			service = new DecisionService(projectRepo, backendFactory);

			await expect(
				service.create({ project: "nonexistent", title: "Test" }),
			).rejects.toThrow("none");
		});

		it("stores optional fields as null when not provided", async () => {
			const result = await service.create({
				project: "testproject",
				title: "Use Postgres",
			});
			expect(result.context).toBeNull();
			expect(result.alternatives).toBeNull();
			expect(result.tags).toBeNull();
			expect(result.links).toBeNull();
		});

		it("passes through optional fields when provided", async () => {
			const result = await service.create({
				project: "testproject",
				title: "Use Postgres",
				context: "Need ACID",
				alternatives: ["MySQL"],
				tags: ["backend"],
				status: "deprecated",
				links: ["https://example.com"],
			});
			expect(result.context).toBe("Need ACID");
			expect(result.alternatives).toEqual(["MySQL"]);
			expect(result.status).toBe("deprecated");
		});
	});

	describe("getById", () => {
		it("returns the decision", async () => {
			await service.create({ project: "testproject", title: "Test" });
			const created = (decisionRepo.create as ReturnType<typeof vi.fn>).mock
				.calls[0][0];
			(decisionRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(
				created,
			);

			const found = await service.getById(created.id);
			expect(found.title).toBe("Test");
		});

		it("throws when decision not found", async () => {
			await expect(service.getById("nonexistent")).rejects.toThrow(
				"Decision 'nonexistent' not found",
			);
		});
	});

	describe("update", () => {
		let existingDecision: Decision;

		beforeEach(async () => {
			existingDecision = await service.create({
				project: "testproject",
				title: "Original",
			});
			(decisionRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(
				existingDecision,
			);
		});

		it("updates only provided fields", async () => {
			const result = await service.update(existingDecision.id, {
				context: "New context",
			});
			expect(result.context).toBe("New context");
			expect(result.title).toBe("Original"); // unchanged
		});

		it("re-computes embedding on update", async () => {
			(embeddingClient.embed as ReturnType<typeof vi.fn>).mockClear();
			await service.update(existingDecision.id, { title: "Updated" });
			expect(embeddingClient.embed).toHaveBeenCalled();
		});

		it("validates project when changed with !== undefined", async () => {
			await expect(
				service.update(existingDecision.id, { project: "nonexistent" }),
			).rejects.toThrow("Project 'nonexistent' not found");
		});

		it("throws when decision not found", async () => {
			(decisionRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(null);
			await expect(
				service.update("nonexistent", { title: "New" }),
			).rejects.toThrow("Decision 'nonexistent' not found");
		});

		it("sets updatedAt to current time", async () => {
			const result = await service.update(existingDecision.id, {
				title: "Updated",
			});
			expect(result.updatedAt).not.toBe(existingDecision.updatedAt);
		});
	});

	describe("delete", () => {
		it("delegates to repo", async () => {
			const decision = await service.create({
				project: "testproject",
				title: "Test",
			});
			(decisionRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(
				decision,
			);

			await service.delete(decision.id);
			expect(decisionRepo.delete).toHaveBeenCalledWith(decision.id);
		});

		it("throws when decision not found", async () => {
			await expect(service.delete("nonexistent")).rejects.toThrow(
				"Decision 'nonexistent' not found",
			);
		});
	});

	describe("list", () => {
		it("delegates to repo with filters", async () => {
			await service.list({ project: "testproject", status: "active" });
			expect(decisionRepo.list).toHaveBeenCalledWith({
				project: "testproject",
				status: "active",
				limit: 20,
			});
		});

		it("defaults limit to 20", async () => {
			await service.list({});
			expect(decisionRepo.list).toHaveBeenCalledWith(
				expect.objectContaining({ limit: 20 }),
			);
		});

		it("respects custom limit", async () => {
			await service.list({ limit: 5 });
			expect(decisionRepo.list).toHaveBeenCalledWith(
				expect.objectContaining({ limit: 5 }),
			);
		});
	});

	describe("search", () => {
		it("embeds query and delegates to repo", async () => {
			await service.search({ query: "why postgres?" });
			expect(embeddingClient.embed).toHaveBeenCalled();
			expect(decisionRepo.searchByVector).toHaveBeenCalled();
		});

		it("defaults limit to 5", async () => {
			await service.search({ query: "test" });
			expect(decisionRepo.searchByVector).toHaveBeenCalledWith(
				expect.any(Array),
				5,
				undefined,
			);
		});

		it("passes project filter", async () => {
			await service.search({ query: "test", project: "testproject" });
			expect(decisionRepo.searchByVector).toHaveBeenCalledWith(
				expect.any(Array),
				5,
				"testproject",
			);
		});

		it("filters results by threshold when provided", async () => {
			(decisionRepo.searchByVector as ReturnType<typeof vi.fn>).mockReturnValue(
				[
					{ decision: makeDecision("d1"), score: 0.9 },
					{ decision: makeDecision("d2"), score: 0.3 },
				],
			);

			const results = await service.search({
				query: "test",
				threshold: 0.5,
			});
			expect(results).toHaveLength(1);
			expect(results[0].score).toBe(0.9);
		});

		it("returns all results when no threshold", async () => {
			(decisionRepo.searchByVector as ReturnType<typeof vi.fn>).mockReturnValue(
				[
					{ decision: makeDecision("d1"), score: 0.9 },
					{ decision: makeDecision("d2"), score: 0.1 },
				],
			);

			const results = await service.search({ query: "test" });
			expect(results).toHaveLength(2);
		});

		it("filters out negative scores", async () => {
			(decisionRepo.searchByVector as ReturnType<typeof vi.fn>).mockReturnValue(
				[
					{ decision: makeDecision("d1"), score: 0.8 },
					{ decision: makeDecision("d2"), score: -0.1 },
					{ decision: makeDecision("d3"), score: 0.3 },
				],
			);

			const results = await service.search({ query: "test" });
			expect(results).toHaveLength(2);
			expect(results.map((r) => r.score)).toEqual([0.8, 0.3]);
		});

		it("returns empty when all scores negative", async () => {
			(decisionRepo.searchByVector as ReturnType<typeof vi.fn>).mockReturnValue(
				[
					{ decision: makeDecision("d1"), score: -0.5 },
					{ decision: makeDecision("d2"), score: -0.2 },
				],
			);

			const results = await service.search({ query: "test" });
			expect(results).toHaveLength(0);
		});

		it("filters score of exactly 0", async () => {
			(decisionRepo.searchByVector as ReturnType<typeof vi.fn>).mockReturnValue(
				[
					{ decision: makeDecision("d1"), score: 0.5 },
					{ decision: makeDecision("d2"), score: 0.0 },
				],
			);

			const results = await service.search({ query: "test" });
			expect(results).toHaveLength(1);
			expect(results[0].score).toBe(0.5);
		});
	});
});

function makeDecision(id: string): Decision {
	return {
		id,
		project: "testproject",
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
