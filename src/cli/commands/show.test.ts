import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("CLI show command", { timeout: 30_000 }, () => {
	let tempDir: string;
	let decisionId: string;
	const bin = "node dist/bin/logd.js";

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "logd-test-"));
		const env = { ...process.env, LOGD_DB_PATH: join(tempDir, "test.db") };
		execSync(`${bin} project create "testproject"`, {
			env,
			encoding: "utf-8",
		});
		const output = execSync(
			`${bin} add "Use Postgres" -p testproject -c "Need ACID" -t backend`,
			{ env, encoding: "utf-8" },
		).toString();
		// Extract decision ID from add output
		const match = output.match(/[0-9a-f-]{36}/);
		decisionId = match ? match[0] : "unknown";
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

	it("shows full detail for a decision", () => {
		const output = run(`show ${decisionId}`);
		expect(output).toContain("Use Postgres");
		expect(output).toContain("Need ACID");
		expect(output).toContain("backend");
	});

	it("fails for non-existent ID", () => {
		expect(() => run("show nonexistent-uuid")).toThrow();
	});
});
