import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Command } from "commander";
import type { DecisionService } from "../../core/decision.service.js";
import type { ProjectService } from "../../core/project.service.js";
import { createMcpServer } from "../../mcp/server.js";

export function registerServeCommand(
	program: Command,
	decisionService: DecisionService,
	projectService: ProjectService,
): void {
	program
		.command("serve")
		.description("Start MCP server over stdio")
		.action(async () => {
			const server = createMcpServer(decisionService, projectService);
			const transport = new StdioServerTransport();
			await server.connect(transport);
		});
}
