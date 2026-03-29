import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../app.js";

export function adminOnly(): MiddlewareHandler<AppEnv> {
	return async (c, next) => {
		if (c.get("role") !== "admin") {
			return c.text("Admin access required", 403);
		}
		await next();
	};
}
