import { serve } from "@hono/node-server";
import { OllamaProvider } from "./adapters/embedding/ollama.provider.js";
import { createApp } from "./adapters/http/app.js";
import { createDatabase } from "./adapters/persistence/database.js";
import { SqliteDecisionRepo } from "./adapters/persistence/sqlite.decision.repo.js";
import { SqliteProjectRepo } from "./adapters/persistence/sqlite.project.repo.js";
import { SqliteTeamRepo } from "./adapters/persistence/sqlite.team.repo.js";
import { SqliteTokenRepo } from "./adapters/persistence/sqlite.token.repo.js";
import { SqliteUserRepo } from "./adapters/persistence/sqlite.user.repo.js";
import { bootstrap } from "./application/bootstrap.js";
import { DecisionService } from "./application/decision.service.js";
import { ProjectService } from "./application/project.service.js";
import { TeamService } from "./application/team.service.js";
import { TokenService } from "./application/token.service.js";
import { UserService } from "./application/user.service.js";
import { loadConfig } from "./config.js";

const config = loadConfig();

const db = createDatabase(config.dbPath);
const embeddingProvider = new OllamaProvider(config.ollamaUrl, config.model);

const userRepo = new SqliteUserRepo(db);
const teamRepo = new SqliteTeamRepo(db);
const tokenRepo = new SqliteTokenRepo(db);
const decisionRepo = new SqliteDecisionRepo(db);
const projectRepo = new SqliteProjectRepo(db);

const tokenService = new TokenService(tokenRepo);
const teamService = new TeamService(teamRepo);
const userService = new UserService(userRepo, tokenService);
const decisionService = new DecisionService(decisionRepo, embeddingProvider);
const projectService = new ProjectService(projectRepo);

bootstrap({ db, userRepo, teamRepo, tokenService, apiToken: config.apiToken });

const app = createApp({
	tokenService,
	teamService,
	userService,
	decisionService,
	projectService,
});

serve({ fetch: app.fetch, port: config.port }, (info) => {
	console.log(`logd server listening on http://localhost:${info.port}`);
});
