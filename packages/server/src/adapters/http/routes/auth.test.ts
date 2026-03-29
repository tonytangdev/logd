import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { authMiddleware } from "../middleware/auth.js";
import { authRoutes } from "./auth.js";

function makeApp() {
	const app = new Hono();
	app.use("*", authMiddleware("test-token"));
	app.route("/auth", authRoutes());
	return app;
}

describe("GET /auth/validate", () => {
	it("returns 200 with valid token", async () => {
		const app = makeApp();
		const res = await app.request("/auth/validate", {
			headers: { Authorization: "Bearer test-token" },
		});
		expect(res.status).toBe(200);
	});

	it("returns 401 without token", async () => {
		const app = makeApp();
		const res = await app.request("/auth/validate");
		expect(res.status).toBe(401);
	});
});
