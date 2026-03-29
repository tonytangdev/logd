import { Hono } from "hono";
import type { TokenService } from "../../../application/token.service.js";
import type { AppEnv } from "../app.js";

export function tokenRoutes(tokenService: TokenService): Hono<AppEnv> {
	const router = new Hono<AppEnv>();

	router.post("/", async (c) => {
		const body = await c.req.json();
		if (!body.name) return c.text("name is required", 400);
		const { raw } = await tokenService.create(c.get("userId"), body.name);
		return c.json({ token: raw }, 201);
	});

	router.get("/", async (c) => {
		const tokens = await tokenService.list(c.get("userId"));
		return c.json(tokens, 200);
	});

	router.delete("/:id", async (c) => {
		await tokenService.revoke(c.req.param("id"));
		return c.body(null, 204);
	});

	return router;
}
