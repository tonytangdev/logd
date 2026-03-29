import { Hono } from "hono";
import type { ProjectService } from "../../../application/project.service.js";
import { ConflictError } from "../../../application/project.service.js";

export function projectRoutes(service: ProjectService): Hono {
	const router = new Hono();

	router.post("/", async (c) => {
		const body = await c.req.json();
		if (!body.name) {
			return c.text("name is required", 400);
		}

		try {
			service.create(body.name, body.description ?? null);
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
