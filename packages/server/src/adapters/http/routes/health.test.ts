import type Database from "better-sqlite3";
import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import { healthRoutes } from "./health.js";

describe("health routes", () => {
	describe("GET /health", () => {
		it("returns 200 with status ok", async () => {
			const app = new Hono();
			app.route(
				"/",
				healthRoutes({
					db: null as unknown as Database.Database,
					ollamaUrl: "",
				}),
			);

			const res = await app.request("/health");
			expect(res.status).toBe(200);
			expect(await res.json()).toEqual({ status: "ok" });
		});
	});

	describe("GET /health/ready", () => {
		afterEach(() => {
			vi.restoreAllMocks();
		});

		it("returns 200 when db and ollama are healthy", async () => {
			const mockDb = {
				prepare: vi.fn(() => ({ get: vi.fn(() => ({ 1: 1 })) })),
			} as unknown as Database.Database;
			vi.stubGlobal(
				"fetch",
				vi.fn(async () => new Response("{}", { status: 200 })),
			);

			const app = new Hono();
			app.route(
				"/",
				healthRoutes({ db: mockDb, ollamaUrl: "http://localhost:11434" }),
			);

			const res = await app.request("/health/ready");
			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body).toEqual({ status: "ready", db: "ok", ollama: "ok" });
		});

		it("returns 503 when db fails", async () => {
			const mockDb = {
				prepare: vi.fn(() => {
					throw new Error("db down");
				}),
			} as unknown as Database.Database;
			vi.stubGlobal(
				"fetch",
				vi.fn(async () => new Response("{}", { status: 200 })),
			);

			const app = new Hono();
			app.route(
				"/",
				healthRoutes({ db: mockDb, ollamaUrl: "http://localhost:11434" }),
			);

			const res = await app.request("/health/ready");
			expect(res.status).toBe(503);
			const body = await res.json();
			expect(body.status).toBe("not_ready");
			expect(body.db).toBe("error");
			expect(body.ollama).toBe("ok");
		});

		it("returns 503 when ollama fails", async () => {
			const mockDb = {
				prepare: vi.fn(() => ({ get: vi.fn(() => ({ 1: 1 })) })),
			} as unknown as Database.Database;
			vi.stubGlobal(
				"fetch",
				vi.fn(async () => {
					throw new Error("connection refused");
				}),
			);

			const app = new Hono();
			app.route(
				"/",
				healthRoutes({ db: mockDb, ollamaUrl: "http://localhost:11434" }),
			);

			const res = await app.request("/health/ready");
			expect(res.status).toBe(503);
			const body = await res.json();
			expect(body.status).toBe("not_ready");
			expect(body.db).toBe("ok");
			expect(body.ollama).toBe("error");
		});
	});
});
