import type { Command } from "commander";
import type { DecisionService } from "../../core/decision.service.js";

export function registerShowCommand(
	program: Command,
	decisionService: DecisionService,
) {
	program
		.command("show <id>")
		.description("Show full detail for a decision")
		.action(async (id: string) => {
			const decision = await decisionService.getById(id);

			console.log(`Title: ${decision.title}`);
			console.log(`ID: ${decision.id}`);
			console.log(`Project: ${decision.project}`);
			console.log(`Status: ${decision.status}`);
			if (decision.context) console.log(`Context: ${decision.context}`);
			if (decision.alternatives)
				console.log(`Alternatives: ${decision.alternatives.join(", ")}`);
			if (decision.tags) console.log(`Tags: ${decision.tags.join(", ")}`);
			if (decision.links) console.log(`Links: ${decision.links.join(", ")}`);
			console.log(`Created: ${decision.createdAt}`);
			console.log(`Updated: ${decision.updatedAt}`);
		});
}
