import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import type { TeamService } from "../../../application/team.service.js";
import type { AppEnv } from "../app.js";
import { teamMiddleware } from "./team.js";

function mockTeamService(
	membership: { teamId: string; role: "admin" | "member" } | null,
) {
	return {
		getMembership: vi.fn(() => membership),
	} as Pick<TeamService, "getMembership">;
}

function makeApp(teamSvc: Pick<TeamService, "getMembership">) {
	const app = new Hono<AppEnv>();
	app.use("*", async (c, next) => {
		c.set("userId", "u-1");
		await next();
	});
	app.use("*", teamMiddleware(teamSvc as TeamService));
	app.get("/test", (c) =>
		c.json({ teamId: c.get("teamId"), role: c.get("role") }),
	);
	return app;
}

describe("team middleware", () => {
	it("returns 401 when X-Team header is missing", async () => {
		const app = makeApp(mockTeamService({ teamId: "t-1", role: "admin" }));
		const res = await app.request("/test");
		expect(res.status).toBe(401);
		expect(await res.text()).toContain("X-Team header is required");
	});

	it("returns 403 when user is not a member", async () => {
		const app = makeApp(mockTeamService(null));
		const res = await app.request("/test", {
			headers: { "X-Team": "acme" },
		});
		expect(res.status).toBe(403);
		expect(await res.text()).toContain("not a member");
	});

	it("sets teamId and role on valid membership", async () => {
		const app = makeApp(mockTeamService({ teamId: "t-1", role: "admin" }));
		const res = await app.request("/test", {
			headers: { "X-Team": "acme" },
		});
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.teamId).toBe("t-1");
		expect(body.role).toBe("admin");
	});
});
