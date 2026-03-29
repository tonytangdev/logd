import { Hono } from "hono";

export function authRoutes(): Hono {
	const router = new Hono();
	router.get("/validate", (c) => c.body(null, 200));
	return router;
}
