import type { Command } from "commander";
import type { ProjectService } from "../../core/project.service.js";

export function registerProjectCommand(
	program: Command,
	projectService: ProjectService,
) {
	const project = program.command("project").description("Manage projects");

	project
		.command("create <name>")
		.description("Create a new project")
		.option("-d, --description <desc>", "Project description")
		.action((name: string, opts: { description?: string }) => {
			try {
				const p = projectService.create(name, opts.description);
				console.log(`Created project: ${p.name}`);
			} catch (e) {
				console.error(`Error: ${(e as Error).message}`);
				process.exit(1);
			}
		});

	project
		.command("list")
		.description("List all projects")
		.action(() => {
			try {
				const projects = projectService.list();
				if (projects.length === 0) {
					console.log("No projects found.");
					return;
				}
				for (const p of projects) {
					const desc = p.description ? ` - ${p.description}` : "";
					console.log(`${p.name}${desc}`);
				}
			} catch (e) {
				console.error(`Error: ${(e as Error).message}`);
				process.exit(1);
			}
		});
}
