import type { Command } from "commander";
import type { DecisionService } from "../../core/decision.service.js";
import type { DecisionStatus } from "../../core/types.js";

export function registerAddCommand(
	program: Command,
	decisionService: DecisionService,
) {
	program
		.command("add <title>")
		.description("Add a new decision")
		.requiredOption("-p, --project <project>", "Project name")
		.option("-c, --context <context>", "Decision context")
		.option("-a, --alternatives <alt>", "Alternative considered", collect, [])
		.option("-t, --tags <tag>", "Tag", collect, [])
		.option("-s, --status <status>", "Decision status", "active")
		.option("-l, --links <link>", "Related link", collect, [])
		.action(
			async (
				title: string,
				opts: {
					project: string;
					context?: string;
					alternatives: string[];
					tags: string[];
					status: string;
					links: string[];
				},
			) => {
				const decision = await decisionService.create({
					project: opts.project,
					title,
					context: opts.context,
					alternatives:
						opts.alternatives.length > 0 ? opts.alternatives : undefined,
					tags: opts.tags.length > 0 ? opts.tags : undefined,
					status: opts.status as DecisionStatus,
					links: opts.links.length > 0 ? opts.links : undefined,
				});
				console.log(`Added decision: ${decision.title} (${decision.id})`);
			},
		);
}

function collect(value: string, prev: string[]): string[] {
	return [...prev, value];
}
