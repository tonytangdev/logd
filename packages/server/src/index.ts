import { serve } from "@hono/node-server";
import { OllamaProvider } from "./adapters/embedding/ollama.provider.js";
import { createApp } from "./adapters/http/app.js";
import { createDatabase } from "./adapters/persistence/database.js";
import { PgDecisionRepo } from "./adapters/persistence/pg.decision.repo.js";
import { PgProjectRepo } from "./adapters/persistence/pg.project.repo.js";
import { PgTeamRepo } from "./adapters/persistence/pg.team.repo.js";
import { PgTokenRepo } from "./adapters/persistence/pg.token.repo.js";
import { PgUserRepo } from "./adapters/persistence/pg.user.repo.js";
import { bootstrap } from "./application/bootstrap.js";
import { DecisionService } from "./application/decision.service.js";
import { ProjectService } from "./application/project.service.js";
import { TeamService } from "./application/team.service.js";
import { TokenService } from "./application/token.service.js";
import { UserService } from "./application/user.service.js";
import { loadConfig } from "./config.js";

async function main() {
	const config = loadConfig();
	if (!config.apiToken) console.warn("LOGD_API_TOKEN not set — bootstrap will skip admin creation");
	const db = await createDatabase(config.databaseUrl);
	const embeddingProvider = new OllamaProvider(config.ollamaUrl, config.model);
	const userRepo = new PgUserRepo(db);
	const teamRepo = new PgTeamRepo(db);
	const tokenRepo = new PgTokenRepo(db);
	const decisionRepo = new PgDecisionRepo(db);
	const projectRepo = new PgProjectRepo(db);
	const tokenService = new TokenService(tokenRepo);
	const teamService = new TeamService(teamRepo);
	const userService = new UserService(userRepo, tokenService);
	const decisionService = new DecisionService(decisionRepo, embeddingProvider);
	const projectService = new ProjectService(projectRepo);
	await bootstrap({ db, userRepo, teamRepo, tokenService, apiToken: config.apiToken });
	const app = createApp({ tokenService, teamService, userService, decisionService, projectService, health: { db, ollamaUrl: config.ollamaUrl } });
	serve({ fetch: app.fetch, port: config.port }, (info) => {
		console.log(`logd server listening on http://localhost:${info.port}`);
	});
}

main().catch((err) => { console.error("Failed to start server:", err); process.exit(1); });
