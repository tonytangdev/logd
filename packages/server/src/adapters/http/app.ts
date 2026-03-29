import { Hono } from "hono";
import type { DecisionService } from "../../application/decision.service.js";
import type { ProjectService } from "../../application/project.service.js";
import type { TeamService } from "../../application/team.service.js";
import type { TokenService } from "../../application/token.service.js";
import type { UserService } from "../../application/user.service.js";
import { createAuthMiddleware } from "./middleware/auth.js";
import { teamMiddleware } from "./middleware/team.js";
import { authRoutes } from "./routes/auth.js";
import { decisionRoutes } from "./routes/decisions.js";
import { projectRoutes } from "./routes/projects.js";
import { teamRoutes } from "./routes/teams.js";
import { tokenRoutes } from "./routes/tokens.js";
import { userRoutes } from "./routes/users.js";

export type AppEnv = {
	Variables: {
		userId: string;
		teamId: string;
		role: "admin" | "member";
	};
};

export interface AppDeps {
	tokenService: TokenService;
	teamService: TeamService;
	userService: UserService;
	decisionService: DecisionService;
	projectService: ProjectService;
}

export function createApp(deps: AppDeps): Hono<AppEnv> {
	const app = new Hono<AppEnv>();
	app.use("*", createAuthMiddleware(deps.tokenService));
	app.use("*", teamMiddleware(deps.teamService));
	app.route("/auth", authRoutes());
	app.route("/decisions", decisionRoutes(deps.decisionService));
	app.route("/projects", projectRoutes(deps.projectService));
	app.route("/teams", teamRoutes(deps.teamService));
	app.route("/users", userRoutes(deps.userService));
	app.route("/tokens", tokenRoutes(deps.tokenService));
	return app;
}
