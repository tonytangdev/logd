import { Hono } from "hono";
import { ConflictError } from "../../../application/project.service.js";
import type { UserService } from "../../../application/user.service.js";
import type { AppEnv } from "../app.js";
import { adminOnly } from "../middleware/role.js";

export function userRoutes(userService: UserService): Hono<AppEnv> {
	const router = new Hono<AppEnv>();

	router.post("/", adminOnly(), async (c) => {
		const body = await c.req.json();
		if (!body.email) return c.text("email is required", 400);
		if (!body.name) return c.text("name is required", 400);
		try {
			const { user, rawToken } = await userService.create(body.email, body.name);
			return c.json({ user, token: rawToken }, 201);
		} catch (e) {
			if (e instanceof ConflictError) return c.text(e.message, 409);
			throw e;
		}
	});

	router.get("/", async (c) => {
		const users = await userService.listByTeam(c.get("teamId"));
		return c.json(users, 200);
	});

	return router;
}
