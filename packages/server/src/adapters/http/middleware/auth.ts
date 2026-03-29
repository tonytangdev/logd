import type { MiddlewareHandler } from "hono";
import { bearerAuth } from "hono/bearer-auth";
import type { TokenService } from "../../../application/token.service.js";
import type { AppEnv } from "../app.js";

export function createAuthMiddleware(
	tokenService: TokenService,
): MiddlewareHandler<AppEnv> {
	return bearerAuth({
		verifyToken: async (token, c) => {
			const result = await tokenService.authenticate(token);
			if (!result) return false;
			c.set("userId", result.id);
			await tokenService.touch(token);
			return true;
		},
	});
}
