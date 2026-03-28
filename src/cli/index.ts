import { Command } from "commander";
import { resolveConfig } from "../core/config.js";
import { DecisionService } from "../core/decision.service.js";
import { EmbeddingService } from "../core/embedding.service.js";
import { ProjectService } from "../core/project.service.js";
import { createDatabase } from "../infra/db.js";
import { DecisionRepo } from "../infra/decision.repo.js";
import { OllamaClient } from "../infra/ollama.client.js";
import { ProjectRepo } from "../infra/project.repo.js";
import { registerAddCommand } from "./commands/add.js";
import { registerProjectCommand } from "./commands/project.js";
import { registerSearchCommand } from "./commands/search.js";

export function createCli(): Command {
	const config = resolveConfig();
	const db = createDatabase(config.dbPath);
	const projectRepo = new ProjectRepo(db);
	const decisionRepo = new DecisionRepo(db);
	const projectService = new ProjectService(projectRepo);
	const ollamaClient = new OllamaClient(config.ollamaUrl, config.model);
	const embeddingService = new EmbeddingService(ollamaClient);
	const decisionService = new DecisionService(
		decisionRepo,
		projectRepo,
		embeddingService,
	);

	const program = new Command();
	program.name("logd").description("Log and search decisions").version("1.0.0");

	registerProjectCommand(program, projectService);
	registerAddCommand(program, decisionService);
	registerSearchCommand(program, decisionService);

	return program;
}
