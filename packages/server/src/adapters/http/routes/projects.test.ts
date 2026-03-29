import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { ProjectService } from "../../../application/project.service.js";
import { createInMemoryDatabase } from "../../persistence/database.js";
import { SqliteProjectRepo } from "../../persistence/sqlite.project.repo.js";
import { authMiddleware } from "../middleware/auth.js";
import { projectRoutes } from "./projects.js";

const TOKEN = "test-token";
const headers = {
	Authorization: `Bearer ${TOKEN}`,
	"Content-Type": "application/json",
};

function makeApp() {
	const db = createInMemoryDatabase();
	const repo = new SqliteProjectRepo(db);
	const service = new ProjectService(repo);
	const app = new Hono();
	app.use("*", authMiddleware(TOKEN));
	app.route("/projects", projectRoutes(service));
	return app;
}

describe("POST /projects", () => {
	it("creates project — 201", async () => {
		const app = makeApp();
		const res = await app.request("/projects", {
			method: "POST",
			headers,
			body: JSON.stringify({ name: "my-proj", description: "desc" }),
		});
		expect(res.status).toBe(201);
	});

	it("returns 400 when name missing", async () => {
		const app = makeApp();
		const res = await app.request("/projects", {
			method: "POST",
			headers,
			body: JSON.stringify({}),
		});
		expect(res.status).toBe(400);
		expect(await res.text()).toContain("name is required");
	});

	it("returns 409 on duplicate", async () => {
		const app = makeApp();
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
