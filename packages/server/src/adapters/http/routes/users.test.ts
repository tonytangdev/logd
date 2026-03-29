import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../app.js";
import { createInMemoryDatabase } from "../../persistence/database.js";
import { SqliteUserRepo } from "../../persistence/sqlite.user.repo.js";
import { SqliteTeamRepo } from "../../persistence/sqlite.team.repo.js";
import { SqliteTokenRepo } from "../../persistence/sqlite.token.repo.js";
import { TokenService } from "../../../application/token.service.js";
import { TeamService } from "../../../application/team.service.js";
import { UserService } from "../../../application/user.service.js";
import { bootstrap } from "../../../application/bootstrap.js";
import { createAuthMiddleware } from "../middleware/auth.js";
import { teamMiddleware } from "../middleware/team.js";
import { userRoutes } from "./users.js";

const API_TOKEN = "test-admin-token";

function setup() {
	const db = createInMemoryDatabase();
	const userRepo = new SqliteUserRepo(db);
	const teamRepo = new SqliteTeamRepo(db);
	const tokenRepo = new SqliteTokenRepo(db);
	const tokenService = new TokenService(tokenRepo);
	const teamService = new TeamService(teamRepo);
	const userService = new UserService(userRepo, tokenService);

	bootstrap({ db, userRepo, teamRepo, tokenService, apiToken: API_TOKEN });

	const app = new Hono<AppEnv>();
	app.use("*", createAuthMiddleware(tokenService));
	app.use("*", teamMiddleware(teamService));
	app.route("/users", userRoutes(userService));
	return app;
}

const headers = {
	Authorization: `Bearer ${API_TOKEN}`,
	"X-Team": "default",
	"Content-Type": "application/json",
};

describe("user routes", () => {
	it("POST /users creates user and returns token — 201", async () => {
		const app = setup();
		const res = await app.request("/users", {
			method: "POST",
			headers,
			body: JSON.stringify({ email: "new@test.com", name: "New User" }),
		});
		expect(res.status).toBe(201);
		const body = await res.json();
		expect(body.user.email).toBe("new@test.com");
		expect(body.token).toHaveLength(64);
	});

	it("POST /users returns 400 when email missing", async () => {
		const app = setup();
		const res = await app.request("/users", {
			method: "POST",
			headers,
			body: JSON.stringify({ name: "No Email" }),
		});
		expect(res.status).toBe(400);
	});

	it("POST /users returns 409 on duplicate email", async () => {
		const app = setup();
		await app.request("/users", {
			method: "POST",
			headers,
			body: JSON.stringify({ email: "dup@test.com", name: "Dup" }),
		});
		const res = await app.request("/users", {
			method: "POST",
			headers,
			body: JSON.stringify({ email: "dup@test.com", name: "Dup 2" }),
		});
		expect(res.status).toBe(409);
	});

	it("GET /users lists users in current team", async () => {
		const app = setup();
		const res = await app.request("/users", { headers });
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.length).toBeGreaterThanOrEqual(1);
	});
});
