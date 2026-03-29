import type { PGlite } from "@electric-sql/pglite";
import { Hono } from "hono";
import { afterEach, describe, expect, it } from "vitest";
import { bootstrap } from "../../../application/bootstrap.js";
import { TeamService } from "../../../application/team.service.js";
import { TokenService } from "../../../application/token.service.js";
import { setupTestDb } from "../../../test-utils.js";
import { PgTeamRepo } from "../../persistence/pg.team.repo.js";
import { PgTokenRepo } from "../../persistence/pg.token.repo.js";
import { PgUserRepo } from "../../persistence/pg.user.repo.js";
import type { AppEnv } from "../app.js";
import { createAuthMiddleware } from "../middleware/auth.js";
import { teamMiddleware } from "../middleware/team.js";
import { tokenRoutes } from "./tokens.js";

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
	app.route("/tokens", tokenRoutes(tokenService));
	return app;
}

const headers = {
	Authorization: `Bearer ${API_TOKEN}`,
	"X-Team": "default",
	"Content-Type": "application/json",
};

describe("token routes", () => {
	it("POST /tokens creates token — 201", async () => {
		const app = await setup();
		const res = await app.request("/tokens", {
			method: "POST",
			headers,
			body: JSON.stringify({ name: "ci-token" }),
		});
		expect(res.status).toBe(201);
		const body = await res.json();
		expect(body.token).toHaveLength(64);
	});

	it("POST /tokens returns 400 when name missing", async () => {
		const app = await setup();
		const res = await app.request("/tokens", {
			method: "POST",
			headers,
			body: JSON.stringify({}),
		});
		expect(res.status).toBe(400);
	});

	it("GET /tokens lists tokens (no raw values)", async () => {
		const app = await setup();
		const res = await app.request("/tokens", { headers });
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.length).toBeGreaterThanOrEqual(1);
		for (const t of body) {
			expect(t).not.toHaveProperty("tokenHash");
			expect(t).not.toHaveProperty("token_hash");
		}
	});

	it("DELETE /tokens/:id revokes token — 204", async () => {
		const app = await setup();
		const createRes = await app.request("/tokens", {
			method: "POST",
			headers,
			body: JSON.stringify({ name: "temp" }),
		});
		await createRes.json();
		const listRes = await app.request("/tokens", { headers });
		const tokens = await listRes.json();
		const newToken = tokens.find(
			(t: { id: string; name: string }) => t.name === "temp",
		);
		const res = await app.request(`/tokens/${newToken.id}`, {
			method: "DELETE",
			headers,
		});
		expect(res.status).toBe(204);
	});
});
