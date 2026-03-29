import { Hono } from "hono";
import type { DecisionService } from "../../application/decision.service.js";
import type { ProjectService } from "../../application/project.service.js";
import { authMiddleware } from "./middleware/auth.js";
import { authRoutes } from "./routes/auth.js";
import { decisionRoutes } from "./routes/decisions.js";
import { projectRoutes } from "./routes/projects.js";

export interface AppDeps {
	apiToken: string;
	decisionService: DecisionService;
	projectService: ProjectService;
}

export function createApp(deps: AppDeps): Hono {
	const app = new Hono();
	app.use("*", authMiddleware(deps.apiToken));
	app.route("/auth", authRoutes());
	app.route("/decisions", decisionRoutes(deps.decisionService));
	app.route("/projects", projectRoutes(deps.projectService));
	return app;
}
