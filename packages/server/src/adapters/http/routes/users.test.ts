import type { PGlite } from "@electric-sql/pglite";
import { Hono } from "hono";
import { afterEach, describe, expect, it } from "vitest";
import { bootstrap } from "../../../application/bootstrap.js";
import { TeamService } from "../../../application/team.service.js";
import { TokenService } from "../../../application/token.service.js";
import { UserService } from "../../../application/user.service.js";
import { setupTestDb } from "../../../test-utils.js";
import { PgTeamRepo } from "../../persistence/pg.team.repo.js";
import { PgTokenRepo } from "../../persistence/pg.token.repo.js";
import { PgUserRepo } from "../../persistence/pg.user.repo.js";
import type { AppEnv } from "../app.js";
import { createAuthMiddleware } from "../middleware/auth.js";
import { teamMiddleware } from "../middleware/team.js";
import { userRoutes } from "./users.js";

const API_TOKEN = "test-admin-token";

let currentPglite: PGlite;

afterEach(async () => {
	await currentPglite?.close();
});

async function setup() {
	const { db, pglite } = await setupTestDb();
	currentPglite = pglite;
	const userRepo = new PgUserRepo(db);
	const teamRepo = new PgTeamRepo(db);
	const tokenRepo = new PgTokenRepo(db);
	const tokenService = new TokenService(tokenRepo);
	const teamService = new TeamService(teamRepo);
	const userService = new UserService(userRepo, tokenService);

	await bootstrap({
		db,
		userRepo,
		teamRepo,
		tokenService,
		apiToken: API_TOKEN,
	});

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
		const app = await setup();
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
		const app = await setup();
		const res = await app.request("/users", {
			method: "POST",
			headers,
			body: JSON.stringify({ name: "No Email" }),
		});
		expect(res.status).toBe(400);
	});

	it("POST /users returns 409 on duplicate email", async () => {
		const app = await setup();
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
		const app = await setup();
		const res = await app.request("/users", { headers });
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.length).toBeGreaterThanOrEqual(1);
	});
});
