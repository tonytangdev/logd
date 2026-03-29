import type { PGlite } from "@electric-sql/pglite";
import { Hono } from "hono";
import { afterEach, describe, expect, it } from "vitest";
import { bootstrap } from "../../../application/bootstrap.js";
import { ProjectService } from "../../../application/project.service.js";
import { TeamService } from "../../../application/team.service.js";
import { TokenService } from "../../../application/token.service.js";
import { setupTestDb } from "../../../test-utils.js";
import { PgProjectRepo } from "../../persistence/pg.project.repo.js";
import { PgTeamRepo } from "../../persistence/pg.team.repo.js";
import { PgTokenRepo } from "../../persistence/pg.token.repo.js";
import { PgUserRepo } from "../../persistence/pg.user.repo.js";
import type { AppEnv } from "../app.js";
import { createAuthMiddleware } from "../middleware/auth.js";
import { teamMiddleware } from "../middleware/team.js";
import { projectRoutes } from "./projects.js";

const API_TOKEN = "test-admin-token";

const headers = {
	Authorization: `Bearer ${API_TOKEN}`,
	"X-Team": "default",
	"Content-Type": "application/json",
};

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
	const projectRepo = new PgProjectRepo(db);
	const tokenService = new TokenService(tokenRepo);
	const teamService = new TeamService(teamRepo);
	const projectService = new ProjectService(projectRepo);

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
	app.route("/projects", projectRoutes(projectService));
	return app;
}

describe("POST /projects", () => {
	it("creates project — 201", async () => {
		const app = await setup();
		const res = await app.request("/projects", {
			method: "POST",
			headers,
			body: JSON.stringify({ name: "my-proj", description: "desc" }),
		});
		expect(res.status).toBe(201);
	});

	it("returns 400 when name missing", async () => {
		const app = await setup();
		const res = await app.request("/projects", {
			method: "POST",
			headers,
			body: JSON.stringify({}),
		});
		expect(res.status).toBe(400);
		expect(await res.text()).toContain("name is required");
	});

	it("returns 409 on duplicate", async () => {
		const app = await setup();
		await app.request("/projects", {
			method: "POST",
			headers,
			body: JSON.stringify({ name: "dup" }),
		});
		const res = await app.request("/projects", {
			method: "POST",
			headers,
			body: JSON.stringify({ name: "dup" }),
		});
		expect(res.status).toBe(409);
		expect(await res.text()).toContain("already exists");
	});
});
