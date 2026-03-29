import type { Command } from "commander";
import type { DecisionService } from "../../core/decision.service.js";

export function registerDeleteCommand(
	program: Command,
	decisionService: DecisionService,
) {
	program
		.command("delete <id>")
		.description("Delete a decision")
		.action(async (id: string) => {
			try {
				await decisionService.delete(id);
				console.log(`Deleted decision: ${id}`);
			} catch (e) {
				console.error(`Error: ${(e as Error).message}`);
				process.exit(1);
			}
		});
}
