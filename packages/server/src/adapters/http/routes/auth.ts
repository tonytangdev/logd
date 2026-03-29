import { Hono } from "hono";
import type { AppEnv } from "../app.js";

export function authRoutes(): Hono<AppEnv> {
	const router = new Hono<AppEnv>();
	router.get("/validate", (c) => c.body(null, 200));
	return router;
}
