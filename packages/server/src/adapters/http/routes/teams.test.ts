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
import * as schema from "../../persistence/schema.js";
import type { AppEnv } from "../app.js";
import { createAuthMiddleware } from "../middleware/auth.js";
import { teamMiddleware } from "../middleware/team.js";
import { teamRoutes } from "./teams.js";

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
	const _userService = new UserService(userRepo, tokenService);

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
		const { app } = await setup();
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
		const { app } = await setup();
		const res = await app.request("/teams", {
			method: "POST",
			headers,
			body: JSON.stringify({}),
		});
		expect(res.status).toBe(400);
	});

	it("POST /teams returns 409 on duplicate", async () => {
		const { app } = await setup();
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
		const { app } = await setup();
		const res = await app.request("/teams", { headers });
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.length).toBeGreaterThanOrEqual(1);
	});

	it("DELETE /teams/:id deletes team — 204", async () => {
		const { app } = await setup();
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
		const { app, db } = await setup();
		await db
			.insert(schema.users)
			.values({ id: "u-2", email: "other@test.com", name: "Other" });
		const [team] = await db
			.select()
			.from(schema.teams)
			.where((await import("drizzle-orm")).eq(schema.teams.name, "default"));
		const res = await app.request(`/teams/${team.id}/members`, {
			method: "POST",
			headers,
			body: JSON.stringify({ userId: "u-2", role: "member" }),
		});
		expect(res.status).toBe(201);
	});

	it("DELETE /teams/:id/members/:userId removes member — 204", async () => {
		const { app, db } = await setup();
		await db
			.insert(schema.users)
			.values({ id: "u-2", email: "other@test.com", name: "Other" });
		const [team] = await db
			.select()
			.from(schema.teams)
			.where((await import("drizzle-orm")).eq(schema.teams.name, "default"));
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
		const { app, db } = await setup();
		await db
			.insert(schema.users)
			.values({ id: "u-2", email: "other@test.com", name: "Other" });
		const [team] = await db
			.select()
			.from(schema.teams)
			.where((await import("drizzle-orm")).eq(schema.teams.name, "default"));
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
