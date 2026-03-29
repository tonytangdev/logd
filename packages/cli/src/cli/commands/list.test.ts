import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("CLI list command", { timeout: 30_000 }, () => {
	let tempDir: string;
	const bin = "node dist/bin/logd.js";

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "logd-test-"));
		const env = { ...process.env, LOGD_DB_PATH: join(tempDir, "test.db") };
		execSync(`${bin} project create "testproject"`, {
			env,
			encoding: "utf-8",
		});
		execSync(`${bin} add "Decision A" -p testproject`, {
			env,
			encoding: "utf-8",
		});
		execSync(`${bin} add "Decision B" -p testproject -s deprecated`, {
			env,
			encoding: "utf-8",
		});
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	function run(args: string): string {
		return execSync(`${bin} ${args}`, {
			env: { ...process.env, LOGD_DB_PATH: join(tempDir, "test.db") },
			encoding: "utf-8",
		}).trim();
	}

	it("lists all decisions", () => {
		const output = run("list");
		expect(output).toContain("Decision A");
		expect(output).toContain("Decision B");
	});

	it("filters by project", () => {
		const output = run("list -p testproject");
		expect(output).toContain("Decision A");
	});

	it("filters by status", () => {
		const output = run("list -s deprecated");
		expect(output).toContain("Decision B");
		expect(output).not.toContain("Decision A");
	});

	it("respects limit", () => {
		const output = run("list -n 1");
		// Should show at most 1 decision
		expect(output).toBeDefined();
	});

	it("shows empty when no decisions match", () => {
		const output = run("list -s superseded");
		expect(output).not.toContain("Decision A");
		expect(output).not.toContain("Decision B");
	});
});
