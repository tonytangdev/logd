import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth.js";
import { createInMemoryDatabase } from "../../persistence/database.js";
import { SqliteProjectRepo } from "../../persistence/sqlite.project.repo.js";
import { SqliteDecisionRepo } from "../../persistence/sqlite.decision.repo.js";
import { ProjectService } from "../../../application/project.service.js";
import { DecisionService } from "../../../application/decision.service.js";
import type { EmbeddingProvider } from "../../../ports/embedding.provider.js";
import { decisionRoutes } from "./decisions.js";

const TOKEN = "test-token";
const headers = {
	Authorization: `Bearer ${TOKEN}`,
	"Content-Type": "application/json",
};

const fakeEmbedding = Array.from({ length: 1024 }, () => 0.1);
const mockEmbedding: EmbeddingProvider = {
	embed: vi.fn(async () => fakeEmbedding),
};

function makeApp() {
	const db = createInMemoryDatabase();
	const projectRepo = new SqliteProjectRepo(db);
	const decisionRepo = new SqliteDecisionRepo(db);
	const projectService = new ProjectService(projectRepo);
	const decisionService = new DecisionService(decisionRepo, mockEmbedding);

	// Seed a project
	projectService.create("proj", null);

	const app = new Hono();
	app.use("*", authMiddleware(TOKEN));
	app.route("/decisions", decisionRoutes(decisionService));
	return app;
}

describe("decision routes", () => {
	describe("POST /decisions", () => {
		it("creates decision — 201 with body", async () => {
			const app = makeApp();
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
			const app = makeApp();
			const res = await app.request("/decisions", {
				method: "POST",
				headers,
				body: JSON.stringify({ project: "proj" }),
			});
			expect(res.status).toBe(400);
			expect(await res.text()).toContain("title is required");
		});

		it("returns 400 when project missing", async () => {
			const app = makeApp();
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
			const app = makeApp();
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
			const app = makeApp();
			const res = await app.request("/decisions/nope", { headers });
			expect(res.status).toBe(404);
			expect(await res.text()).toContain("not found");
		});
	});

	describe("PATCH /decisions/:id", () => {
		it("updates decision — 204", async () => {
			const app = makeApp();
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
			const app = makeApp();
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
			const app = makeApp();
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

			// Verify deleted
			const getRes = await app.request(`/decisions/${id}`, { headers });
			expect(getRes.status).toBe(404);
		});
	});

	describe("GET /decisions?project=&status=&limit=", () => {
		it("lists decisions filtered by project", async () => {
			const app = makeApp();
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
	});

	describe("POST /decisions/search", () => {
		it("searches decisions", async () => {
			const app = makeApp();
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
			const app = makeApp();
			const res = await app.request("/decisions/search", {
				method: "POST",
				headers,
				body: JSON.stringify({ query: "test" }),
			});
			expect(res.status).toBe(400);
			expect(await res.text()).toContain("project is required");
		});

		it("returns 400 when query missing", async () => {
			const app = makeApp();
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
