import { bearerAuth } from "hono/bearer-auth";
import type { MiddlewareHandler } from "hono";
import type { TokenService } from "../../../application/token.service.js";
import type { AppEnv } from "../app.js";

/** @deprecated legacy shim — remove in T19 */
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

export function createAuthMiddleware(
	tokenService: TokenService,
): MiddlewareHandler<AppEnv> {
	return bearerAuth({
		verifyToken: async (token, c) => {
			const result = tokenService.authenticate(token);
			if (!result) return false;
			c.set("userId", result.id);
			tokenService.touch(token);
			return true;
		},
	});
}
