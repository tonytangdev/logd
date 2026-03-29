import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { bootstrap } from "../../../application/bootstrap.js";
import { TeamService } from "../../../application/team.service.js";
import { TokenService } from "../../../application/token.service.js";
import { UserService } from "../../../application/user.service.js";
import { createInMemoryDatabase } from "../../persistence/database.js";
import { SqliteTeamRepo } from "../../persistence/sqlite.team.repo.js";
import { SqliteTokenRepo } from "../../persistence/sqlite.token.repo.js";
import { SqliteUserRepo } from "../../persistence/sqlite.user.repo.js";
import type { AppEnv } from "../app.js";
import { createAuthMiddleware } from "../middleware/auth.js";
import { teamMiddleware } from "../middleware/team.js";
import { teamRoutes } from "./teams.js";

const API_TOKEN = "test-admin-token";

function setup() {
	const db = createInMemoryDatabase();
	const userRepo = new SqliteUserRepo(db);
	const teamRepo = new SqliteTeamRepo(db);
	const tokenRepo = new SqliteTokenRepo(db);
	const tokenService = new TokenService(tokenRepo);
	const teamService = new TeamService(teamRepo);
	const _userService = new UserService(userRepo, tokenService);

	bootstrap({ db, userRepo, teamRepo, tokenService, apiToken: API_TOKEN });

	const app = new Hono<AppEnv>();
	app.use("*", createAuthMiddleware(tokenService));
	app.use("*", teamMiddleware(teamService));
	app.route("/teams", teamRoutes(teamService));
	return { app, db, teamRepo };
}

const headers = {
	Authorization: `Bearer ${API_TOKEN}`,
	"X-Team": "default",
	"Content-Type": "application/json",
};

describe("team routes", () => {
	it("POST /teams creates team — 201", async () => {
		const { app } = setup();
		const res = await app.request("/teams", {
			method: "POST",
			headers,
			body: JSON.stringify({ name: "new-team" }),
		});
		expect(res.status).toBe(201);
		const body = await res.json();
		expect(body.name).toBe("new-team");
	});

	it("POST /teams returns 400 when name missing", async () => {
		const { app } = setup();
		const res = await app.request("/teams", {
			method: "POST",
			headers,
			body: JSON.stringify({}),
		});
		expect(res.status).toBe(400);
	});

	it("POST /teams returns 409 on duplicate", async () => {
		const { app } = setup();
		await app.request("/teams", {
			method: "POST",
			headers,
			body: JSON.stringify({ name: "dup" }),
		});
		const res = await app.request("/teams", {
			method: "POST",
			headers,
			body: JSON.stringify({ name: "dup" }),
		});
		expect(res.status).toBe(409);
	});

	it("GET /teams lists user's teams", async () => {
		const { app } = setup();
		const res = await app.request("/teams", { headers });
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.length).toBeGreaterThanOrEqual(1);
	});

	it("DELETE /teams/:id deletes team — 204", async () => {
		const { app } = setup();
		const createRes = await app.request("/teams", {
			method: "POST",
			headers,
			body: JSON.stringify({ name: "to-delete" }),
		});
		const { id } = await createRes.json();
		const res = await app.request(`/teams/${id}`, {
			method: "DELETE",
			headers,
		});
		expect(res.status).toBe(204);
	});

	it("POST /teams/:id/members adds member — 201", async () => {
		const { app, db } = setup();
		db.exec(
			"INSERT INTO users (id, email, name, created_at) VALUES ('u-2', 'other@test.com', 'Other', '2026-01-01')",
		);
		const team = db
			.prepare("SELECT id FROM teams WHERE name = 'default'")
			.get() as { id: string };
		const res = await app.request(`/teams/${team.id}/members`, {
			method: "POST",
			headers,
			body: JSON.stringify({ userId: "u-2", role: "member" }),
		});
		expect(res.status).toBe(201);
	});

	it("DELETE /teams/:id/members/:userId removes member — 204", async () => {
		const { app, db } = setup();
		db.exec(
			"INSERT INTO users (id, email, name, created_at) VALUES ('u-2', 'other@test.com', 'Other', '2026-01-01')",
		);
		const team = db
			.prepare("SELECT id FROM teams WHERE name = 'default'")
			.get() as { id: string };
		await app.request(`/teams/${team.id}/members`, {
			method: "POST",
			headers,
			body: JSON.stringify({ userId: "u-2", role: "member" }),
		});
		const res = await app.request(`/teams/${team.id}/members/u-2`, {
			method: "DELETE",
			headers,
		});
		expect(res.status).toBe(204);
	});

	it("PATCH /teams/:id/members/:userId changes role — 204", async () => {
		const { app, db } = setup();
		db.exec(
			"INSERT INTO users (id, email, name, created_at) VALUES ('u-2', 'other@test.com', 'Other', '2026-01-01')",
		);
		const team = db
			.prepare("SELECT id FROM teams WHERE name = 'default'")
			.get() as { id: string };
		await app.request(`/teams/${team.id}/members`, {
			method: "POST",
			headers,
			body: JSON.stringify({ userId: "u-2", role: "member" }),
		});
		const res = await app.request(`/teams/${team.id}/members/u-2`, {
			method: "PATCH",
			headers,
			body: JSON.stringify({ role: "admin" }),
		});
		expect(res.status).toBe(204);
	});
});
