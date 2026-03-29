import { homedir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { BackendFactory } from "../core/backend.factory.js";
import { resolveConfig } from "../core/config.js";
import { DecisionService } from "../core/decision.service.js";
import { EmbeddingService } from "../core/embedding.service.js";
import { ProjectService } from "../core/project.service.js";
import { CredentialStore } from "../infra/credentials.js";
import { createDatabase } from "../infra/db.js";
import { DecisionRepo } from "../infra/decision.repo.js";
import { OllamaClient } from "../infra/ollama.client.js";
import { ProjectRepo } from "../infra/project.repo.js";
import { registerAddCommand } from "./commands/add.js";
import { registerDeleteCommand } from "./commands/delete.js";
import { registerEditCommand } from "./commands/edit.js";
import { registerListCommand } from "./commands/list.js";
import { registerLoginCommand } from "./commands/login.js";
import { registerProjectCommand } from "./commands/project.js";
import { registerSearchCommand } from "./commands/search.js";
import { registerServeCommand } from "./commands/serve.js";
import { registerShowCommand } from "./commands/show.js";

export function createCli(): Command {
	const config = resolveConfig();
	const db = createDatabase(config.dbPath);
	const projectRepo = new ProjectRepo(db);
	const decisionRepo = new DecisionRepo(db);
	const projectService = new ProjectService(projectRepo);
	const ollamaClient = new OllamaClient(config.ollamaUrl, config.model);
	const embeddingService = new EmbeddingService(ollamaClient);
	const credentialStore = new CredentialStore(
		join(homedir(), ".logd", "credentials.json"),
	);
	const backendFactory = new BackendFactory(
		decisionRepo,
		credentialStore,
		embeddingService,
	);
	const decisionService = new DecisionService(projectRepo, backendFactory);

	const program = new Command();
	program.name("logd").description("Log and search decisions").version("1.0.0");

	registerProjectCommand(program, projectService);
	registerAddCommand(program, decisionService);
	registerSearchCommand(program, decisionService);
	registerShowCommand(program, decisionService);
	registerEditCommand(program, decisionService);
	registerListCommand(program, decisionService);
	registerDeleteCommand(program, decisionService);
	registerServeCommand(program, decisionService, projectService);
	registerLoginCommand(program, credentialStore);

	return program;
}
