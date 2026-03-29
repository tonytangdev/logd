import { describe, expect, it, vi } from "vitest";
import {
	buildDocumentTemplate,
	buildQueryTemplate,
	EmbeddingService,
} from "./embedding.service.js";
import type { IEmbeddingClient } from "./types.js";

describe("buildDocumentTemplate", () => {
	it("includes all fields when all are present", () => {
		const result = buildDocumentTemplate({
			title: "Use Postgres",
			context: "Need ACID transactions",
			alternatives: ["MySQL", "MongoDB"],
			tags: ["backend", "database"],
			status: "active",
		});
		expect(result).toBe(
			"Decision: Use Postgres\nContext: Need ACID transactions\nAlternatives: MySQL, MongoDB\nTags: backend, database\nStatus: active",
		);
	});

	it("includes only title when other fields are missing", () => {
		const result = buildDocumentTemplate({ title: "Use Postgres" });
		expect(result).toBe("Decision: Use Postgres");
	});

	it("skips null fields", () => {
		const result = buildDocumentTemplate({
			title: "Use Postgres",
			context: null,
			alternatives: null,
			tags: ["backend"],
			status: "active",
		});
		expect(result).toBe(
			"Decision: Use Postgres\nTags: backend\nStatus: active",
		);
	});

	it("skips empty arrays", () => {
		const result = buildDocumentTemplate({
			title: "Use Postgres",
			alternatives: [],
			tags: [],
		});
		expect(result).toBe("Decision: Use Postgres");
	});

	it("handles single-element arrays", () => {
		const result = buildDocumentTemplate({
			title: "Use Postgres",
			alternatives: ["MySQL"],
		});
		expect(result).toContain("Alternatives: MySQL");
	});
});

describe("buildQueryTemplate", () => {
	it("wraps query with instruction prefix", () => {
		const result = buildQueryTemplate("why did we choose Postgres?");
		expect(result).toBe(
			"Instruct: Given a question about past decisions, retrieve relevant decision records\nQuery: why did we choose Postgres?",
		);
	});

	it("preserves query as-is", () => {
		const query = "what database do we use?";
		const result = buildQueryTemplate(query);
		expect(result).toContain(`Query: ${query}`);
	});
});

describe("EmbeddingService", () => {
	function createMockClient(): IEmbeddingClient {
		return {
			embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
		};
	}

	it("embedDecision calls client with document template", async () => {
		const client = createMockClient();
		const service = new EmbeddingService(client);

		const result = await service.embedDecision({
			title: "Use Postgres",
			context: "Need ACID",
		});

		expect(client.embed).toHaveBeenCalledWith(
			"Decision: Use Postgres\nContext: Need ACID",
		);
		expect(result).toEqual([0.1, 0.2, 0.3]);
	});

	it("embedQuery calls client with query template", async () => {
		const client = createMockClient();
		const service = new EmbeddingService(client);

		const result = await service.embedQuery("why postgres?");

		expect(client.embed).toHaveBeenCalledWith(
			expect.stringContaining("Instruct:"),
		);
		expect(client.embed).toHaveBeenCalledWith(
			expect.stringContaining("Query: why postgres?"),
		);
		expect(result).toEqual([0.1, 0.2, 0.3]);
	});

	it("embedDecision propagates client errors", async () => {
		const client = createMockClient();
		(client.embed as ReturnType<typeof vi.fn>).mockRejectedValue(
			new Error("connection failed"),
		);
		const service = new EmbeddingService(client);

		await expect(service.embedDecision({ title: "test" })).rejects.toThrow(
			"connection failed",
		);
	});
});
