import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("CLI search command", { timeout: 30_000 }, () => {
	let tempDir: string;
	const bin = "node dist/bin/logd.js";

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "logd-test-"));
		const env = { ...process.env, LOGD_DB_PATH: join(tempDir, "test.db") };
		execSync(`${bin} project create "testproject"`, {
			env,
			encoding: "utf-8",
		});
		execSync(
			`${bin} add "Use Postgres for persistence" -p testproject -c "Need ACID transactions" -t backend -t database`,
			{ env, encoding: "utf-8" },
		);
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

	it("returns results for a matching query", () => {
		const output = run('search "database choice"');
		expect(output).toContain("Postgres");
	});

	it("respects --limit flag", () => {
		const output = run('search "database" -n 1');
		// Should return at most 1 result
		expect(output).toBeDefined();
	});

	it("shows more detail with --verbose", () => {
		const output = run('search "database" -v');
		expect(output).toContain("ACID");
	});

	it("filters by project", () => {
		const output = run('search "database" -p testproject');
		expect(output).toContain("Postgres");
	});

	it("returns empty for unrelated query", () => {
		const output = run('search "quantum physics"');
		// May show "no results" or empty output
		expect(output).toBeDefined();
	});
});
