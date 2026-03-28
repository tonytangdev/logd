import { Command } from "commander";
import { resolveConfig } from "../core/config.js";
import { ProjectService } from "../core/project.service.js";
import { createDatabase } from "../infra/db.js";
import { ProjectRepo } from "../infra/project.repo.js";
import { registerProjectCommand } from "./commands/project.js";

export function createCli(): Command {
	const config = resolveConfig();
	const db = createDatabase(config.dbPath);
	const projectRepo = new ProjectRepo(db);
	const projectService = new ProjectService(projectRepo);

	const program = new Command();
	program.name("logd").description("Log and search decisions").version("1.0.0");

	registerProjectCommand(program, projectService);

	return program;
}
