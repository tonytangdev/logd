import type { MiddlewareHandler } from "hono";
import type { TeamService } from "../../../application/team.service.js";
import type { AppEnv } from "../app.js";

export function teamMiddleware(
	teamService: TeamService,
): MiddlewareHandler<AppEnv> {
	return async (c, next) => {
		const teamName = c.req.header("X-Team");
		if (!teamName) {
			return c.text("X-Team header is required", 401);
		}

		const userId = c.get("userId");
		const membership = await teamService.getMembership(userId, teamName);
		if (!membership) {
			return c.text("Access denied: not a member of this team.", 403);
		}

		c.set("teamId", membership.teamId);
		c.set("role", membership.role);
		await next();
	};
}
