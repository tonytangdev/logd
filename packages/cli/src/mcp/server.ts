import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { DecisionService } from "../core/decision.service.js";
import type { ProjectService } from "../core/project.service.js";
import type { DecisionStatus } from "../core/types.js";

export function createMcpServer(
	decisionService: DecisionService,
	projectService: ProjectService,
): McpServer {
	const server = new McpServer({
		name: "logd",
		version: "1.0.0",
	});

	server.tool(
		"logd_create_project",
		"Create a new project",
		{
			name: z.string(),
			description: z.string().optional(),
			server: z.string().optional().describe("Remote server URL"),
			team: z.string().optional().describe("Team name on the remote server"),
		},
		async (args) => {
			try {
				const project = projectService.create(
					args.name,
					args.description,
					args.server,
					args.team,
				);
				return { content: [{ type: "text", text: JSON.stringify(project) }] };
			} catch (err) {
				return {
					content: [{ type: "text", text: (err as Error).message }],
					isError: true,
				};
			}
		},
	);

	server.tool("logd_list_projects", "List all projects", async () => {
		try {
			const projects = projectService.list();
			return { content: [{ type: "text", text: JSON.stringify(projects) }] };
		} catch (err) {
			return {
				content: [{ type: "text", text: (err as Error).message }],
				isError: true,
			};
		}
	});

	server.tool(
		"logd_add_decision",
		"Add a new decision",
		{
			project: z.string(),
			title: z.string(),
			context: z.string().optional(),
			alternatives: z.array(z.string()).optional(),
			tags: z.array(z.string()).optional(),
			status: z.string().optional(),
			links: z.array(z.string()).optional(),
		},
		async (args) => {
			try {
				const decision = await decisionService.create({
					project: args.project,
					title: args.title,
					context: args.context,
					alternatives: args.alternatives,
					tags: args.tags,
					status: args.status as DecisionStatus | undefined,
					links: args.links,
				});
				return { content: [{ type: "text", text: JSON.stringify(decision) }] };
			} catch (err) {
				return {
					content: [{ type: "text", text: (err as Error).message }],
					isError: true,
				};
			}
		},
	);

	server.tool(
		"logd_search_decisions",
		"Search decisions semantically",
		{
			query: z.string(),
			project: z.string().optional(),
			limit: z.number().optional(),
			threshold: z.number().optional(),
		},
		async (args) => {
			try {
				const results = await decisionService.search({
					query: args.query,
					project: args.project,
					limit: args.limit,
					threshold: args.threshold,
				});
				return { content: [{ type: "text", text: JSON.stringify(results) }] };
			} catch (err) {
				return {
					content: [{ type: "text", text: (err as Error).message }],
					isError: true,
				};
			}
		},
	);

	server.tool(
		"logd_show_decision",
		"Show a decision by ID",
		{ id: z.string() },
		async (args) => {
			try {
				const decision = await decisionService.getById(args.id);
				return { content: [{ type: "text", text: JSON.stringify(decision) }] };
			} catch (err) {
				return {
					content: [{ type: "text", text: (err as Error).message }],
					isError: true,
				};
			}
		},
	);

	server.tool(
		"logd_edit_decision",
		"Edit a decision",
		{
			id: z.string(),
			project: z.string().optional(),
			title: z.string().optional(),
			context: z.string().optional(),
			alternatives: z.array(z.string()).optional(),
			tags: z.array(z.string()).optional(),
			status: z.string().optional(),
			links: z.array(z.string()).optional(),
		},
		async (args) => {
			try {
				const { id, ...input } = args;
				const decision = await decisionService.update(id, {
					...input,
					status: input.status as DecisionStatus | undefined,
				});
				return { content: [{ type: "text", text: JSON.stringify(decision) }] };
			} catch (err) {
				return {
					content: [{ type: "text", text: (err as Error).message }],
					isError: true,
				};
			}
		},
	);

	server.tool(
		"logd_delete_decision",
		"Delete a decision",
		{ id: z.string() },
		async (args) => {
			try {
				await decisionService.delete(args.id);
				return {
					content: [
						{ type: "text", text: JSON.stringify({ deleted: args.id }) },
					],
				};
			} catch (err) {
				return {
					content: [{ type: "text", text: (err as Error).message }],
					isError: true,
				};
			}
		},
	);

	server.tool(
		"logd_list_decisions",
		"List decisions with optional filters",
		{
			project: z.string().optional(),
			status: z.string().optional(),
			limit: z.number().optional(),
		},
		async (args) => {
			try {
				const decisions = await decisionService.list({
					project: args.project,
					status: args.status as DecisionStatus | undefined,
					limit: args.limit,
				});
				return {
					content: [{ type: "text", text: JSON.stringify(decisions) }],
				};
			} catch (err) {
				return {
					content: [{ type: "text", text: (err as Error).message }],
					isError: true,
				};
			}
		},
	);

	return server;
}
