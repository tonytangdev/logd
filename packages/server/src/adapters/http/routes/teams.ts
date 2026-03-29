import { Hono } from "hono";
import { ConflictError } from "../../../application/project.service.js";
import type { TeamService } from "../../../application/team.service.js";
import { BadRequestError } from "../../../application/team.service.js";
import type { AppEnv } from "../app.js";
import { adminOnly } from "../middleware/role.js";

export function teamRoutes(teamService: TeamService): Hono<AppEnv> {
	const router = new Hono<AppEnv>();

	router.post("/", adminOnly(), async (c) => {
		const body = await c.req.json();
		if (!body.name) return c.text("name is required", 400);
		try {
			const team = teamService.create(body.name);
			return c.json(team, 201);
		} catch (e) {
			if (e instanceof ConflictError) return c.text(e.message, 409);
			throw e;
		}
	});

	router.get("/", (c) => {
		const teams = teamService.listByUser(c.get("userId"));
		return c.json(teams, 200);
	});

	router.delete("/:id", adminOnly(), (c) => {
		try {
			teamService.delete(c.req.param("id"));
			return c.body(null, 204);
		} catch (e) {
			if (e instanceof BadRequestError) return c.text(e.message, 400);
			throw e;
		}
	});

	router.post("/:id/members", adminOnly(), async (c) => {
		const body = await c.req.json();
		if (!body.userId) return c.text("userId is required", 400);
		if (!body.role) return c.text("role is required", 400);
		teamService.addMember(c.req.param("id"), body.userId, body.role);
		return c.body(null, 201);
	});

	router.delete("/:id/members/:userId", adminOnly(), (c) => {
		teamService.removeMember(c.req.param("id"), c.req.param("userId"));
		return c.body(null, 204);
	});

	router.patch("/:id/members/:userId", adminOnly(), async (c) => {
		const body = await c.req.json();
		if (!body.role) return c.text("role is required", 400);
		teamService.updateMemberRole(
			c.req.param("id"),
			c.req.param("userId"),
			body.role,
		);
		return c.body(null, 204);
	});

	return router;
}
