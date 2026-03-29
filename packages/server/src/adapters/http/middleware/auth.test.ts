import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import type { TokenService } from "../../../application/token.service.js";
import { createAuthMiddleware } from "./auth.js";

function mockTokenService(
	valid = true,
): Pick<TokenService, "authenticate" | "touch"> {
	return {
		authenticate: vi.fn(() => (valid ? { id: "u-1" } : null)),
		touch: vi.fn(),
	};
}

function makeApp(tokenSvc: Pick<TokenService, "authenticate" | "touch">) {
	const app = new Hono();
	app.use("*", createAuthMiddleware(tokenSvc as any));
	app.get("/test", (c) => c.json({ userId: c.get("userId") }));
	return app;
}

describe("auth middleware (bearerAuth)", () => {
	it("returns 401 when no Authorization header", async () => {
		const app = makeApp(mockTokenService());
		const res = await app.request("/test");
		expect(res.status).toBe(401);
	});

	it("returns 401 when token is invalid", async () => {
		const app = makeApp(mockTokenService(false));
		const res = await app.request("/test", {
			headers: { Authorization: "Bearer badtoken" },
		});
		expect(res.status).toBe(401);
	});

	it("sets userId on valid token", async () => {
		const app = makeApp(mockTokenService());
		const res = await app.request("/test", {
			headers: { Authorization: "Bearer goodtoken" },
		});
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.userId).toBe("u-1");
	});

	it("calls touch on valid token", async () => {
		const svc = mockTokenService();
		const app = makeApp(svc);
		await app.request("/test", {
			headers: { Authorization: "Bearer goodtoken" },
		});
		expect(svc.touch).toHaveBeenCalledWith("goodtoken");
	});
});
