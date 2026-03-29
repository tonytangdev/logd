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
		.option("--server <url>", "Remote server URL")
		.option("--team <team>", "Team name on the remote server")
		.action(
			(
				name: string,
				opts: { description?: string; server?: string; team?: string },
			) => {
				try {
					const p = projectService.create(
						name,
						opts.description,
						opts.server,
						opts.team,
					);
					const remote = p.server
						? ` (remote: ${p.server}, team: ${p.team})`
						: "";
					console.log(`Created project: ${p.name}${remote}`);
				} catch (e) {
					console.error(`Error: ${(e as Error).message}`);
					process.exit(1);
				}
			},
		);

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
					const remote = p.server ? ` [${p.server} / ${p.team}]` : "";
					console.log(`${p.name}${desc}${remote}`);
				}
			} catch (e) {
				console.error(`Error: ${(e as Error).message}`);
				process.exit(1);
			}
		});
}
