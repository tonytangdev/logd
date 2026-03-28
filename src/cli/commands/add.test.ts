import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("CLI add command", { timeout: 30_000 }, () => {
	let tempDir: string;
	const bin = "node dist/bin/logd.js";

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "logd-test-"));
		// Seed a project
		execSync(`${bin} project create "testproject"`, {
			env: {
				...process.env,
				LOGD_DB_PATH: join(tempDir, "test.db"),
				LOGD_OLLAMA_URL: "http://localhost:11434",
			},
			encoding: "utf-8",
		});
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	function run(args: string): string {
		return execSync(`${bin} ${args}`, {
			env: {
				...process.env,
				LOGD_DB_PATH: join(tempDir, "test.db"),
				LOGD_OLLAMA_URL: "http://localhost:11434",
			},
			encoding: "utf-8",
		}).trim();
	}

	it("adds a decision with required fields", () => {
		const output = run('add "Use Postgres" -p testproject');
		expect(output).toContain("Use Postgres");
	});

	it("adds a decision with all optional fields", () => {
		const output = run(
			'add "Use Postgres" -p testproject -c "Need ACID" -a "MySQL" -a "MongoDB" -t backend -t db -s active -l "https://example.com"',
		);
		expect(output).toContain("Use Postgres");
	});

	it("fails when project is missing", () => {
		try {
			run('add "Test"');
			expect.fail("should have thrown");
		} catch (e: any) {
			expect(e.stderr).toContain("required option");
			expect(e.stderr).not.toContain("at ");
		}
	});

	it("fails when project does not exist", () => {
		try {
			run('add "Test" -p nonexistent');
			expect.fail("should have thrown");
		} catch (e: any) {
			expect(e.stderr).toContain("Error: Project 'nonexistent' not found");
			expect(e.stderr).not.toContain("at ");
		}
	});
});
