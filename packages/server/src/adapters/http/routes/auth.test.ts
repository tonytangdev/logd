import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { AppEnv } from "../app.js";
import { bootstrap } from "../../../application/bootstrap.js";
import { TeamService } from "../../../application/team.service.js";
import { TokenService } from "../../../application/token.service.js";
import { createInMemoryDatabase } from "../../persistence/database.js";
import { SqliteTeamRepo } from "../../persistence/sqlite.team.repo.js";
import { SqliteTokenRepo } from "../../persistence/sqlite.token.repo.js";
import { SqliteUserRepo } from "../../persistence/sqlite.user.repo.js";
import { createAuthMiddleware } from "../middleware/auth.js";
import { teamMiddleware } from "../middleware/team.js";
import { authRoutes } from "./auth.js";

const API_TOKEN = "test-admin-token";

function setup() {
	const db = createInMemoryDatabase();
	const userRepo = new SqliteUserRepo(db);
	const teamRepo = new SqliteTeamRepo(db);
	const tokenRepo = new SqliteTokenRepo(db);
	const tokenService = new TokenService(tokenRepo);
	const teamService = new TeamService(teamRepo);

	bootstrap({ db, userRepo, teamRepo, tokenService, apiToken: API_TOKEN });

	const app = new Hono<AppEnv>();
	app.use("*", createAuthMiddleware(tokenService));
	app.use("*", teamMiddleware(teamService));
	app.route("/auth", authRoutes());
	return app;
}

describe("GET /auth/validate", () => {
	it("returns 200 with valid token + X-Team", async () => {
		const app = setup();
		const res = await app.request("/auth/validate", {
			headers: {
				Authorization: `Bearer ${API_TOKEN}`,
				"X-Team": "default",
			},
		});
		expect(res.status).toBe(200);
	});

	it("returns 401 without token", async () => {
		const app = setup();
		const res = await app.request("/auth/validate");
		expect(res.status).toBe(401);
	});

	it("returns 403 with valid token but wrong team", async () => {
		const app = setup();
		const res = await app.request("/auth/validate", {
			headers: {
				Authorization: `Bearer ${API_TOKEN}`,
				"X-Team": "nonexistent-team",
			},
		});
		expect(res.status).toBe(403);
	});
});
