import { Hono } from "hono";
import type { DecisionService } from "../../../application/decision.service.js";
import { NotFoundError } from "../../../application/decision.service.js";
import type { AppEnv } from "../app.js";

export function decisionRoutes(service: DecisionService): Hono<AppEnv> {
	const router = new Hono<AppEnv>();

	// IMPORTANT: /search must come before /:id
	router.post("/search", async (c) => {
		const body = await c.req.json();
		if (!body.project) return c.text("project is required", 400);
		if (!body.query) return c.text("query is required", 400);

		const results = await service.search(
			body.project,
			body.query,
			body.threshold ?? 0,
			body.limit ?? 20,
			c.get("teamId"),
		);
		return c.json(results, 200);
	});

	router.post("/", async (c) => {
		const body = await c.req.json();
		if (!body.project) return c.text("project is required", 400);
		if (!body.title) return c.text("title is required", 400);

		const decision = await service.create(body);
		return c.json(decision, 201);
	});

	router.get("/:id", (c) => {
		const decision = service.get(c.req.param("id"));
		if (!decision) {
			return c.text(`Decision '${c.req.param("id")}' not found`, 404);
		}
		return c.json(decision, 200);
	});

	router.patch("/:id", async (c) => {
		const body = await c.req.json();
		try {
			await service.update(c.req.param("id"), body);
			return c.body(null, 204);
		} catch (e) {
			if (e instanceof NotFoundError) {
				return c.text(e.message, 404);
			}
			throw e;
		}
	});

	router.delete("/:id", (c) => {
		service.delete(c.req.param("id"));
		return c.body(null, 204);
	});

	router.get("/", (c) => {
		const project = c.req.query("project");
		const status = c.req.query("status");
		const limit = c.req.query("limit");

		const decisions = service.list({
			project: project || undefined,
			status: (status as "active" | "superseded" | "deprecated") || undefined,
			limit: limit ? Number(limit) : undefined,
			teamId: c.get("teamId"),
		});
		return c.json(decisions, 200);
	});

	return router;
}
