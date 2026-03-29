import type { Command } from "commander";
import type { DecisionService } from "../../core/decision.service.js";

export function registerSearchCommand(
	program: Command,
	decisionService: DecisionService,
) {
	program
		.command("search <query>")
		.description("Search decisions semantically")
		.option("-p, --project <project>", "Filter by project")
		.option("-n, --limit <number>", "Max results", "5")
		.option("-t, --threshold <number>", "Minimum similarity score")
		.option("-v, --verbose", "Show all fields")
		.action(
			async (
				query: string,
				opts: {
					project?: string;
					limit: string;
					threshold?: string;
					verbose?: boolean;
				},
			) => {
				try {
					const results = await decisionService.search({
						query,
						project: opts.project,
						limit: Number.parseInt(opts.limit, 10),
						threshold: opts.threshold
							? Number.parseFloat(opts.threshold)
							: undefined,
					});

					if (results.length === 0) {
						console.log("No results found.");
						return;
					}

					for (const { decision, score } of results) {
						if (opts.verbose) {
							console.log(`Title: ${decision.title}`);
							console.log(`ID: ${decision.id}`);
							console.log(`Project: ${decision.project}`);
							console.log(`Score: ${score.toFixed(4)}`);
							console.log(`Status: ${decision.status}`);
							if (decision.context) console.log(`Context: ${decision.context}`);
							if (decision.alternatives)
								console.log(
									`Alternatives: ${decision.alternatives.join(", ")}`,
								);
							if (decision.tags)
								console.log(`Tags: ${decision.tags.join(", ")}`);
							if (decision.links)
								console.log(`Links: ${decision.links.join(", ")}`);
							console.log(`Created: ${decision.createdAt}`);
							console.log(`Updated: ${decision.updatedAt}`);
							console.log("---");
						} else {
							console.log(
								`${decision.title} | ${decision.project} | ${score.toFixed(4)} | ${decision.id}`,
							);
						}
					}
				} catch (e) {
					console.error(`Error: ${(e as Error).message}`);
					process.exit(1);
				}
			},
		);
}
