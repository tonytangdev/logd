import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("CLI project commands", () => {
	let tempDir: string;
	const bin = "node dist/bin/logd.js";

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "logd-test-"));
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

	it("creates a project", () => {
		const output = run('project create "my-project" -d "Test project"');
		expect(output).toContain("my-project");
	});

	it("lists projects", () => {
		run('project create "alpha"');
		run('project create "beta"');
		const output = run("project list");
		expect(output).toContain("alpha");
		expect(output).toContain("beta");
	});

	it("fails on duplicate project", () => {
		run('project create "dup"');
		try {
			run('project create "dup"');
			expect.fail("should have thrown");
		} catch (err) {
			const e = err as { stderr: string };
			expect(e.stderr).toContain("Error: Project 'dup' already exists");
			expect(e.stderr).not.toContain("at ");
		}
	});

	it("lists empty when no projects", () => {
		const output = run("project list");
		// Should not throw, may show empty or "no projects" message
		expect(output).toBeDefined();
	});
});
