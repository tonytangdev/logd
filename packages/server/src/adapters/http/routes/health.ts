import type Database from "better-sqlite3";
import { Hono } from "hono";

export interface HealthDeps {
	db: Database.Database;
	ollamaUrl: string;
}

export function healthRoutes(deps: HealthDeps): Hono {
	const app = new Hono();

	app.get("/health", (c) => {
		return c.json({ status: "ok" });
	});

	app.get("/health/ready", async (c) => {
		let dbStatus = "ok";
		let ollamaStatus = "ok";

		try {
			deps.db.prepare("SELECT 1").get();
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

	return app;
}
