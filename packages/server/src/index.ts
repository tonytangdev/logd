import { serve } from "@hono/node-server";
import { DecisionService } from "./application/decision.service.js";
import { ProjectService } from "./application/project.service.js";
import { OllamaProvider } from "./adapters/embedding/ollama.provider.js";
import { createApp } from "./adapters/http/app.js";
import { createDatabase } from "./adapters/persistence/database.js";
import { SqliteDecisionRepo } from "./adapters/persistence/sqlite.decision.repo.js";
import { SqliteProjectRepo } from "./adapters/persistence/sqlite.project.repo.js";
import { loadConfig } from "./config.js";

const config = loadConfig();

const db = createDatabase(config.dbPath);
const embeddingProvider = new OllamaProvider(config.ollamaUrl, config.model);

const decisionRepo = new SqliteDecisionRepo(db);
const projectRepo = new SqliteProjectRepo(db);

const decisionService = new DecisionService(decisionRepo, embeddingProvider);
const projectService = new ProjectService(projectRepo);

const app = createApp({
	apiToken: config.apiToken,
	decisionService,
	projectService,
});

serve({ fetch: app.fetch, port: config.port }, (info) => {
	console.log(`logd server listening on http://localhost:${info.port}`);
});
