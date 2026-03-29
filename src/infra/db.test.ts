import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDatabase } from "./db.js";

describe("createDatabase", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "logd-test-"));
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("creates DB file and parent directories", () => {
		const dbPath = join(tempDir, "nested", "deep", "logd.db");
		const db = createDatabase(dbPath);
		db.close();
		expect(() => require("node:fs").statSync(dbPath)).not.toThrow();
	});

	it("creates projects table with correct columns", () => {
		const db = createDatabase(join(tempDir, "test.db"));
		const columns = db.pragma("table_info(projects)") as { name: string }[];
		const names = columns.map((c: { name: string }) => c.name);
		expect(names).toContain("id");
		expect(names).toContain("name");
		expect(names).toContain("description");
		expect(names).toContain("created_at");
		db.close();
	});

	it("creates projects table with server and team columns", () => {
		const db = createDatabase(join(tempDir, "test.db"));
		const columns = db.pragma("table_info(projects)") as { name: string }[];
		const names = columns.map((c: { name: string }) => c.name);
		expect(names).toContain("server");
		expect(names).toContain("team");
		db.close();
	});

	it("creates decisions table with correct columns", () => {
		const db = createDatabase(join(tempDir, "test.db"));
		const columns = db.pragma("table_info(decisions)") as { name: string }[];
		const names = columns.map((c: { name: string }) => c.name);
		expect(names).toEqual(
			expect.arrayContaining([
				"id",
				"project",
				"title",
				"context",
				"alternatives",
				"tags",
				"status",
				"links",
				"created_at",
				"updated_at",
			]),
		);
		db.close();
	});

	it("creates decisions_vec virtual table", () => {
		const db = createDatabase(join(tempDir, "test.db"));
		// sqlite-vec virtual tables show up in sqlite_master
		const tables = db
			.prepare(
				"SELECT name FROM sqlite_master WHERE type='table' AND name='decisions_vec'",
			)
			.all();
		expect(tables).toHaveLength(1);
		db.close();
	});

	it("migrations are idempotent — running twice does not throw", () => {
		const dbPath = join(tempDir, "test.db");
		const db1 = createDatabase(dbPath);
		db1.close();
		expect(() => {
			const db2 = createDatabase(dbPath);
			db2.close();
		}).not.toThrow();
	});

	it("enforces foreign keys", () => {
		const db = createDatabase(join(tempDir, "test.db"));
		const fk = db.pragma("foreign_keys") as { foreign_keys: number }[];
		expect(fk[0].foreign_keys).toBe(1);
		db.close();
	});

	it("uses WAL journal mode", () => {
		const db = createDatabase(join(tempDir, "test.db"));
		const mode = db.pragma("journal_mode") as { journal_mode: string }[];
		expect(mode[0].journal_mode).toBe("wal");
		db.close();
	});
});
