import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { authMiddleware } from "./auth.js";

function makeApp(token: string) {
	const app = new Hono();
	app.use("*", authMiddleware(token));
	app.get("/test", (c) => c.text("ok"));
	return app;
}

describe("authMiddleware", () => {
	it("returns 401 when no Authorization header", async () => {
		const app = makeApp("secret");
		const res = await app.request("/test");
		expect(res.status).toBe(401);
		const body = await res.text();
		expect(body).toContain("Authentication failed");
	});

	it("returns 401 when token is wrong", async () => {
		const app = makeApp("secret");
		const res = await app.request("/test", {
			headers: { Authorization: "Bearer wrong" },
		});
		expect(res.status).toBe(401);
	});

	it("passes with correct token", async () => {
		const app = makeApp("secret");
		const res = await app.request("/test", {
			headers: { Authorization: "Bearer secret" },
		});
		expect(res.status).toBe(200);
		expect(await res.text()).toBe("ok");
	});

	it("accepts X-Team header without error", async () => {
		const app = makeApp("secret");
		const res = await app.request("/test", {
			headers: {
				Authorization: "Bearer secret",
				"X-Team": "my-team",
			},
		});
		expect(res.status).toBe(200);
	});
});
