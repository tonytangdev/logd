import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../app.js";
import { bootstrap } from "../../../application/bootstrap.js";
import { DecisionService } from "../../../application/decision.service.js";
import { ProjectService } from "../../../application/project.service.js";
import { TeamService } from "../../../application/team.service.js";
import { TokenService } from "../../../application/token.service.js";
import type { EmbeddingProvider } from "../../../ports/embedding.provider.js";
import { createInMemoryDatabase } from "../../persistence/database.js";
import { SqliteDecisionRepo } from "../../persistence/sqlite.decision.repo.js";
import { SqliteProjectRepo } from "../../persistence/sqlite.project.repo.js";
import { SqliteTeamRepo } from "../../persistence/sqlite.team.repo.js";
import { SqliteTokenRepo } from "../../persistence/sqlite.token.repo.js";
import { SqliteUserRepo } from "../../persistence/sqlite.user.repo.js";
import { createAuthMiddleware } from "../middleware/auth.js";
import { teamMiddleware } from "../middleware/team.js";
import { decisionRoutes } from "./decisions.js";

const API_TOKEN = "test-admin-token";
const fakeEmbedding = Array.from({ length: 1024 }, () => 0.1);
const mockEmbedding: EmbeddingProvider = { embed: vi.fn(async () => fakeEmbedding) };

const headers = {
	Authorization: `Bearer ${API_TOKEN}`,
	"X-Team": "default",
	"Content-Type": "application/json",
};

function setup() {
	const db = createInMemoryDatabase();
	const userRepo = new SqliteUserRepo(db);
	const teamRepo = new SqliteTeamRepo(db);
	const tokenRepo = new SqliteTokenRepo(db);
	const projectRepo = new SqliteProjectRepo(db);
	const decisionRepo = new SqliteDecisionRepo(db);
	const tokenService = new TokenService(tokenRepo);
	const teamService = new TeamService(teamRepo);
	const projectService = new ProjectService(projectRepo);
	const decisionService = new DecisionService(decisionRepo, mockEmbedding);

	bootstrap({ db, userRepo, teamRepo, tokenService, apiToken: API_TOKEN });

	const defaultTeam = teamRepo.findByName("default")!;
	projectService.create("proj", null, defaultTeam.id);

	const app = new Hono<AppEnv>();
	app.use("*", createAuthMiddleware(tokenService));
	app.use("*", teamMiddleware(teamService));
	app.route("/decisions", decisionRoutes(decisionService));
	return { app, projectService, teamRepo, decisionService };
}

describe("decision routes", () => {
	describe("POST /decisions", () => {
		it("creates decision — 201 with body", async () => {
			const { app } = setup();
			const res = await app.request("/decisions", {
				method: "POST",
				headers,
				body: JSON.stringify({ project: "proj", title: "Use Hono" }),
			});
			expect(res.status).toBe(201);
			const body = await res.json();
			expect(body.title).toBe("Use Hono");
			expect(body.id).toBeDefined();
		});

		it("returns 400 when title missing", async () => {
			const { app } = setup();
			const res = await app.request("/decisions", {
				method: "POST",
				headers,
				body: JSON.stringify({ project: "proj" }),
			});
			expect(res.status).toBe(400);
			expect(await res.text()).toContain("title is required");
		});

		it("returns 400 when project missing", async () => {
			const { app } = setup();
			const res = await app.request("/decisions", {
				method: "POST",
				headers,
				body: JSON.stringify({ title: "Test" }),
			});
			expect(res.status).toBe(400);
			expect(await res.text()).toContain("project is required");
		});
	});

	describe("GET /decisions/:id", () => {
		it("returns decision", async () => {
			const { app } = setup();
			const createRes = await app.request("/decisions", {
				method: "POST",
				headers,
				body: JSON.stringify({ project: "proj", title: "T" }),
			});
			const { id } = await createRes.json();

			const res = await app.request(`/decisions/${id}`, { headers });
			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.id).toBe(id);
		});

		it("returns 404 for missing", async () => {
			const { app } = setup();
			const res = await app.request("/decisions/nope", { headers });
			expect(res.status).toBe(404);
			expect(await res.text()).toContain("not found");
		});
	});

	describe("PATCH /decisions/:id", () => {
		it("updates decision — 204", async () => {
			const { app } = setup();
			const createRes = await app.request("/decisions", {
				method: "POST",
				headers,
				body: JSON.stringify({ project: "proj", title: "T" }),
			});
			const { id } = await createRes.json();

			const res = await app.request(`/decisions/${id}`, {
				method: "PATCH",
				headers,
				body: JSON.stringify({ title: "Updated" }),
			});
			expect(res.status).toBe(204);
		});

		it("returns 404 for missing", async () => {
			const { app } = setup();
			const res = await app.request("/decisions/nope", {
				method: "PATCH",
				headers,
				body: JSON.stringify({ title: "X" }),
			});
			expect(res.status).toBe(404);
		});
	});

	describe("DELETE /decisions/:id", () => {
		it("deletes decision — 204", async () => {
			const { app } = setup();
			const createRes = await app.request("/decisions", {
				method: "POST",
				headers,
				body: JSON.stringify({ project: "proj", title: "T" }),
			});
			const { id } = await createRes.json();

			const res = await app.request(`/decisions/${id}`, {
				method: "DELETE",
				headers,
			});
			expect(res.status).toBe(204);

			const getRes = await app.request(`/decisions/${id}`, { headers });
			expect(getRes.status).toBe(404);
		});
	});

	describe("GET /decisions?project=&status=&limit=", () => {
		it("lists decisions filtered by project", async () => {
			const { app } = setup();
			await app.request("/decisions", {
				method: "POST",
				headers,
				body: JSON.stringify({ project: "proj", title: "T1" }),
			});

			const res = await app.request("/decisions?project=proj", { headers });
			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body).toHaveLength(1);
		});

		it("cross-team isolation — decisions from other team not returned", async () => {
			const db = createInMemoryDatabase();
			const userRepo = new SqliteUserRepo(db);
			const teamRepo = new SqliteTeamRepo(db);
			const tokenRepo = new SqliteTokenRepo(db);
			const projectRepo = new SqliteProjectRepo(db);
			const decisionRepo = new SqliteDecisionRepo(db);
			const tokenService = new TokenService(tokenRepo);
			const teamService = new TeamService(teamRepo);
			const projectService = new ProjectService(projectRepo);
			const decisionService = new DecisionService(decisionRepo, mockEmbedding);

			bootstrap({ db, userRepo, teamRepo, tokenService, apiToken: API_TOKEN });

			const defaultTeam = teamRepo.findByName("default")!;
			projectService.create("proj", null, defaultTeam.id);

			// Create a second team with its own project + decision
			const { buildTeam } = await import("../../../domain/team.js");
			const otherTeam = buildTeam("other");
			teamRepo.create(otherTeam);
			projectService.create("other-proj", null, otherTeam.id);
			decisionService.create({ project: "other-proj", title: "Other team decision" });

			const app = new Hono<AppEnv>();
			app.use("*", createAuthMiddleware(tokenService));
			app.use("*", teamMiddleware(teamService));
			app.route("/decisions", decisionRoutes(decisionService));

			const res = await app.request("/decisions", { headers });
			expect(res.status).toBe(200);
			const body = await res.json();
			// default team has no decisions, other team's decision should not appear
			expect(body).toHaveLength(0);
		});
	});

	describe("POST /decisions/search", () => {
		it("searches decisions", async () => {
			const { app } = setup();
			await app.request("/decisions", {
				method: "POST",
				headers,
				body: JSON.stringify({ project: "proj", title: "Use Hono for HTTP" }),
			});

			const res = await app.request("/decisions/search", {
				method: "POST",
				headers,
				body: JSON.stringify({
					project: "proj",
					query: "HTTP framework",
					threshold: 0,
					limit: 10,
				}),
			});
			expect(res.status).toBe(200);
			const body = await res.json();
			expect(Array.isArray(body)).toBe(true);
		});

		it("returns 400 when project missing", async () => {
			const { app } = setup();
			const res = await app.request("/decisions/search", {
				method: "POST",
				headers,
				body: JSON.stringify({ query: "test" }),
			});
			expect(res.status).toBe(400);
			expect(await res.text()).toContain("project is required");
		});

		it("returns 400 when query missing", async () => {
			const { app } = setup();
			const res = await app.request("/decisions/search", {
				method: "POST",
				headers,
				body: JSON.stringify({ project: "proj" }),
			});
			expect(res.status).toBe(400);
			expect(await res.text()).toContain("query is required");
		});
	});
});
