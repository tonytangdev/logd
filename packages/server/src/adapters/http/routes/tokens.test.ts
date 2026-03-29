import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { bootstrap } from "../../../application/bootstrap.js";
import { TeamService } from "../../../application/team.service.js";
import { TokenService } from "../../../application/token.service.js";
import { createInMemoryDatabase } from "../../persistence/database.js";
import { SqliteTeamRepo } from "../../persistence/sqlite.team.repo.js";
import { SqliteTokenRepo } from "../../persistence/sqlite.token.repo.js";
import { SqliteUserRepo } from "../../persistence/sqlite.user.repo.js";
import type { AppEnv } from "../app.js";
import { createAuthMiddleware } from "../middleware/auth.js";
import { teamMiddleware } from "../middleware/team.js";
import { tokenRoutes } from "./tokens.js";

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
		const app = setup();
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
		const app = setup();
		const res = await app.request("/tokens", {
			method: "POST",
			headers,
			body: JSON.stringify({}),
		});
		expect(res.status).toBe(400);
	});

	it("GET /tokens lists tokens (no raw values)", async () => {
		const app = setup();
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
		const app = setup();
		const createRes = await app.request("/tokens", {
			method: "POST",
			headers,
			body: JSON.stringify({ name: "temp" }),
		});
		await createRes.json();
		const listRes = await app.request("/tokens", { headers });
		const tokens = await listRes.json();
		const newToken = tokens.find((t: any) => t.name === "temp");
		const res = await app.request(`/tokens/${newToken.id}`, {
			method: "DELETE",
			headers,
		});
		expect(res.status).toBe(204);
	});
});
