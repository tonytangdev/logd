import type { Command } from "commander";
import type { DecisionService } from "../../core/decision.service.js";
import type { DecisionStatus } from "../../core/types.js";

export function registerListCommand(
	program: Command,
	decisionService: DecisionService,
) {
	program
		.command("list")
		.description("List decisions with optional filters")
		.option("-p, --project <project>", "Filter by project")
		.option("-s, --status <status>", "Filter by status")
		.option("-n, --limit <number>", "Max results", "20")
		.action((opts: { project?: string; status?: string; limit: string }) => {
			try {
				const decisions = decisionService.list({
					project: opts.project,
					status: opts.status as DecisionStatus | undefined,
					limit: Number.parseInt(opts.limit, 10),
				});

				if (decisions.length === 0) {
					console.log("No decisions found.");
					return;
				}

				for (const d of decisions) {
					console.log(`${d.title} | ${d.project} | ${d.status} | ${d.id}`);
				}
			} catch (e) {
				console.error(`Error: ${(e as Error).message}`);
				process.exit(1);
			}
		});
}
