import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { adminOnly } from "./role.js";
import type { AppEnv } from "../app.js";

function makeApp(role: "admin" | "member") {
	const app = new Hono<AppEnv>();
	app.use("*", async (c, next) => {
		c.set("userId", "u-1");
		c.set("teamId", "t-1");
		c.set("role", role);
		await next();
	});
	app.get("/admin", adminOnly(), (c) => c.text("ok"));
	return app;
}

describe("adminOnly middleware", () => {
	it("passes for admin", async () => {
		const app = makeApp("admin");
		const res = await app.request("/admin");
		expect(res.status).toBe(200);
	});

	it("returns 403 for member", async () => {
		const app = makeApp("member");
		const res = await app.request("/admin");
		expect(res.status).toBe(403);
		expect(await res.text()).toContain("Admin access required");
	});
});
