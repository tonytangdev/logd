import { Hono } from "hono";
import type { AppEnv } from "../app.js";
import type { TokenService } from "../../../application/token.service.js";

export function tokenRoutes(tokenService: TokenService): Hono<AppEnv> {
	const router = new Hono<AppEnv>();

	router.post("/", async (c) => {
		const body = await c.req.json();
		if (!body.name) return c.text("name is required", 400);
		const { raw } = tokenService.create(c.get("userId"), body.name);
		return c.json({ token: raw }, 201);
	});

	router.get("/", (c) => {
		const tokens = tokenService.list(c.get("userId"));
		return c.json(tokens, 200);
	});

	router.delete("/:id", (c) => {
		tokenService.revoke(c.req.param("id"));
		return c.body(null, 204);
	});

	return router;
}
