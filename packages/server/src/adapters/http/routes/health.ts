import { Hono } from "hono";
import type { Database } from "../../persistence/database.js";

export interface HealthDeps {
	db: Database;
	ollamaUrl: string;
}

export function healthRoutes(deps: HealthDeps): Hono {
	const router = new Hono();

	router.get("/health", (c) => {
		return c.json({ status: "ok" });
	});

	router.get("/health/ready", async (c) => {
		let dbStatus = "ok";
		let ollamaStatus = "ok";

		try {
			await deps.db.execute("SELECT 1");
		} catch {
			dbStatus = "error";
		}

		try {
			const res = await fetch(`${deps.ollamaUrl}/api/tags`);
			if (!res.ok) ollamaStatus = "error";
		} catch {
			ollamaStatus = "error";
		}

		const ready = dbStatus === "ok" && ollamaStatus === "ok";
		return c.json(
			{
				status: ready ? "ready" : "not_ready",
				db: dbStatus,
				ollama: ollamaStatus,
			},
			ready ? 200 : 503,
		);
	});

	return router;
}
