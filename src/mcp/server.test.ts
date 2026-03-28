import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DecisionService } from "../core/decision.service.js";
import type { ProjectService } from "../core/project.service.js";
import type { Decision, SearchResult } from "../core/types.js";
import { createMcpServer } from "./server.js";

function mockDecisionService() {
	return {
		create: vi.fn(),
		getById: vi.fn(),
		update: vi.fn(),
		delete: vi.fn(),
		list: vi.fn(),
		search: vi.fn(),
	} as unknown as DecisionService;
}

function mockProjectService() {
	return {
		create: vi.fn(),
		list: vi.fn(),
	} as unknown as ProjectService;
}

describe("MCP server", () => {
	let decisionService: DecisionService;
	let projectService: ProjectService;
	let client: Client;

	beforeEach(async () => {
		decisionService = mockDecisionService();
		projectService = mockProjectService();
		const server = createMcpServer(decisionService, projectService);
		const [clientTransport, serverTransport] =
			InMemoryTransport.createLinkedPair();
		client = new Client({ name: "test-client", version: "1.0.0" });
		await server.connect(serverTransport);
		await client.connect(clientTransport);
	});

	describe("tool registration", () => {
		it("registers all 8 tools", async () => {
			const { tools } = await client.listTools();
			const expectedTools = [
				"logd_add_decision",
				"logd_search_decisions",
				"logd_show_decision",
				"logd_edit_decision",
				"logd_delete_decision",
				"logd_list_decisions",
				"logd_create_project",
				"logd_list_projects",
			];
			const names = tools.map((t) => t.name);
			for (const name of expectedTools) {
				expect(names).toContain(name);
			}
			expect(tools).toHaveLength(8);
		});
	});

	describe("tool handlers", () => {
		it("logd_create_project delegates to ProjectService.create", async () => {
			const project = {
				id: "p1",
				name: "test",
				description: "A test",
				createdAt: "2024-01-01",
			};
			vi.mocked(projectService.create).mockReturnValue(project);
			const result = await client.callTool({
				name: "logd_create_project",
				arguments: { name: "test", description: "A test" },
			});
			expect(projectService.create).toHaveBeenCalledWith("test", "A test");
			expect(result.content).toEqual([
				{ type: "text", text: JSON.stringify(project) },
			]);
		});

		it("logd_list_projects delegates to ProjectService.list", async () => {
			const projects = [
				{ id: "p1", name: "test", description: null, createdAt: "2024-01-01" },
			];
			vi.mocked(projectService.list).mockReturnValue(projects);
			const result = await client.callTool({
				name: "logd_list_projects",
				arguments: {},
			});
			expect(projectService.list).toHaveBeenCalled();
			expect(result.content).toEqual([
				{ type: "text", text: JSON.stringify(projects) },
			]);
		});

		it("logd_add_decision delegates to DecisionService.create", async () => {
			const decision = {
				id: "d1",
				project: "test",
				title: "Use Postgres",
				context: "Need ACID",
				alternatives: null,
				tags: null,
				status: "active" as const,
				links: null,
				createdAt: "2024-01-01",
				updatedAt: "2024-01-01",
			};
			vi.mocked(decisionService.create).mockResolvedValue(decision);
			const result = await client.callTool({
				name: "logd_add_decision",
				arguments: {
					project: "test",
					title: "Use Postgres",
					context: "Need ACID",
				},
			});
			expect(decisionService.create).toHaveBeenCalledWith(
				expect.objectContaining({ title: "Use Postgres" }),
			);
			expect(result.content).toEqual([
				{ type: "text", text: JSON.stringify(decision) },
			]);
		});

		it("logd_search_decisions delegates to DecisionService.search", async () => {
			const results = [
				{
					decision: { id: "d1", title: "Use Postgres" },
					score: 0.9,
				},
			] as unknown as SearchResult[];
			vi.mocked(decisionService.search).mockResolvedValue(results);
			const result = await client.callTool({
				name: "logd_search_decisions",
				arguments: { query: "database", limit: 3 },
			});
			expect(decisionService.search).toHaveBeenCalledWith(
				expect.objectContaining({ query: "database", limit: 3 }),
			);
			expect(result.content).toEqual([
				{ type: "text", text: JSON.stringify(results) },
			]);
		});

		it("logd_show_decision delegates to DecisionService.getById", async () => {
			const decision = { id: "uuid", title: "Use Postgres" };
			vi.mocked(decisionService.getById).mockReturnValue(
				decision as unknown as Decision,
			);
			const result = await client.callTool({
				name: "logd_show_decision",
				arguments: { id: "uuid" },
			});
			expect(decisionService.getById).toHaveBeenCalledWith("uuid");
			expect(result.content).toEqual([
				{ type: "text", text: JSON.stringify(decision) },
			]);
		});

		it("logd_edit_decision delegates to DecisionService.update", async () => {
			const decision = {
				id: "uuid",
				title: "Use Postgres",
				status: "superseded",
			};
			vi.mocked(decisionService.update).mockResolvedValue(
				decision as unknown as Decision,
			);
			const result = await client.callTool({
				name: "logd_edit_decision",
				arguments: { id: "uuid", status: "superseded" },
			});
			expect(decisionService.update).toHaveBeenCalledWith("uuid", {
				status: "superseded",
			});
			expect(result.content).toEqual([
				{ type: "text", text: JSON.stringify(decision) },
			]);
		});

		it("logd_delete_decision delegates to DecisionService.delete", async () => {
			const result = await client.callTool({
				name: "logd_delete_decision",
				arguments: { id: "uuid" },
			});
			expect(decisionService.delete).toHaveBeenCalledWith("uuid");
			expect(result.content).toEqual([
				{ type: "text", text: JSON.stringify({ deleted: "uuid" }) },
			]);
		});

		it("logd_list_decisions delegates to DecisionService.list", async () => {
			const decisions = [{ id: "d1", title: "Use Postgres" }];
			vi.mocked(decisionService.list).mockReturnValue(
				decisions as unknown as Decision[],
			);
			const result = await client.callTool({
				name: "logd_list_decisions",
				arguments: { project: "test", status: "active" },
			});
			expect(decisionService.list).toHaveBeenCalledWith({
				project: "test",
				status: "active",
			});
			expect(result.content).toEqual([
				{ type: "text", text: JSON.stringify(decisions) },
			]);
		});

		it("tool handlers return JSON content", async () => {
			vi.mocked(projectService.list).mockReturnValue([]);
			const result = await client.callTool({
				name: "logd_list_projects",
				arguments: {},
			});
			const content = result.content as Array<{ type: string; text: string }>;
			expect(content[0].type).toBe("text");
			expect(() => JSON.parse(content[0].text)).not.toThrow();
		});

		it("tool handlers return error messages for failures", async () => {
			vi.mocked(decisionService.getById).mockImplementation(() => {
				throw new Error("Decision 'nonexistent' not found");
			});
			const result = await client.callTool({
				name: "logd_show_decision",
				arguments: { id: "nonexistent" },
			});
			expect(result.isError).toBe(true);
		});
	});
});
