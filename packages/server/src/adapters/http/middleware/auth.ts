import type { MiddlewareHandler } from "hono";

export function authMiddleware(apiToken: string): MiddlewareHandler {
	return async (c, next) => {
		const authHeader = c.req.header("Authorization");
		if (!authHeader?.startsWith("Bearer ")) {
			return c.text("Authentication failed: token expired or invalid.", 401);
		}

		const token = authHeader.slice(7);
		if (token !== apiToken) {
			return c.text("Authentication failed: token expired or invalid.", 401);
		}

		await next();
	};
}
