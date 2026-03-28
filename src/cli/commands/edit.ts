import type { Command } from "commander";
import type { DecisionService } from "../../core/decision.service.js";
import type { DecisionStatus } from "../../core/types.js";

export function registerEditCommand(
	program: Command,
	decisionService: DecisionService,
) {
	program
		.command("edit <id>")
		.description("Edit an existing decision")
		.option("-p, --project <project>", "Project name")
		.option("--title <title>", "Decision title")
		.option("-c, --context <context>", "Decision context")
		.option("-a, --alternatives <alt>", "Alternative considered", collect, [])
		.option("-t, --tags <tag>", "Tag", collect, [])
		.option("-s, --status <status>", "Decision status")
		.option("-l, --links <link>", "Related link", collect, [])
		.action(
			async (
				id: string,
				opts: {
					project?: string;
					title?: string;
					context?: string;
					alternatives: string[];
					tags: string[];
					status?: string;
					links: string[];
				},
			) => {
				const input: Record<string, unknown> = {};
				if (opts.project !== undefined) input.project = opts.project;
				if (opts.title !== undefined) input.title = opts.title;
				if (opts.context !== undefined) input.context = opts.context;
				if (opts.alternatives.length > 0)
					input.alternatives = opts.alternatives;
				if (opts.tags.length > 0) input.tags = opts.tags;
				if (opts.status !== undefined)
					input.status = opts.status as DecisionStatus;
				if (opts.links.length > 0) input.links = opts.links;

				const decision = await decisionService.update(id, input);
				console.log(`Updated decision: ${decision.title} (${decision.id})`);
			},
		);
}

function collect(value: string, prev: string[]): string[] {
	return [...prev, value];
}
