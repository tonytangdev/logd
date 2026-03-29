import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Decision } from "../core/types.js";
import { RemoteClient } from "./remote.client.js";
import { RemoteDecisionBackend } from "./remote.decision.backend.js";

vi.mock("./remote.client.js");

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

describe("RemoteDecisionBackend", () => {
	let client: RemoteClient;
	let backend: RemoteDecisionBackend;

	beforeEach(() => {
		client = new RemoteClient("https://api.example.com", "token", "team");
		client.createDecision = vi.fn();
		client.getDecision = vi.fn().mockResolvedValue(makeDecision("d1"));
		client.updateDecision = vi.fn();
		client.deleteDecision = vi.fn();
		client.listDecisions = vi.fn().mockResolvedValue([makeDecision("d1")]);
		client.searchDecisions = vi.fn().mockResolvedValue([]);
		backend = new RemoteDecisionBackend(client);
	});

	it("create sends decision data, ignores embedding", async () => {
		await backend.create(makeDecision("d1"), [0.1, 0.2]);
		expect(client.createDecision).toHaveBeenCalledWith(
			"test",
			expect.objectContaining({
				project: "test",
				title: "Test",
				status: "active",
			}),
		);
	});

	it("findById delegates to client", async () => {
		const result = await backend.findById("d1");
		expect(result).toEqual(makeDecision("d1"));
	});

	it("update delegates to client, ignores embedding", async () => {
		await backend.update("d1", { title: "New" }, [0.2]);
		expect(client.updateDecision).toHaveBeenCalledWith("d1", { title: "New" });
	});

	it("delete delegates to client", async () => {
		await backend.delete("d1");
		expect(client.deleteDecision).toHaveBeenCalledWith("d1");
	});

	it("list delegates to client", async () => {
		const results = await backend.list({ project: "test" });
		expect(results).toHaveLength(1);
	});

	it("searchByQuery delegates to client", async () => {
		await backend.searchByQuery("test", "why postgres?", 0.5, 10);
		expect(client.searchDecisions).toHaveBeenCalledWith(
			"test",
			"why postgres?",
			0.5,
			10,
		);
	});
});
