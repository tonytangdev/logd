import { Hono } from "hono";
import type { ProjectService } from "../../../application/project.service.js";
import { ConflictError } from "../../../application/project.service.js";
import type { AppEnv } from "../app.js";

export function projectRoutes(service: ProjectService): Hono<AppEnv> {
	const router = new Hono<AppEnv>();

	router.post("/", async (c) => {
		const body = await c.req.json();
		if (!body.name) {
			return c.text("name is required", 400);
		}

		try {
			await service.create(
				body.name,
				body.description ?? null,
				c.get("teamId"),
			);
			return c.body(null, 201);
		} catch (e) {
			if (e instanceof ConflictError) {
				return c.text(e.message, 409);
			}
			throw e;
		}
	});

	return router;
}
