import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("CLI delete command", { timeout: 30_000 }, () => {
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
		const output = execSync(`${bin} add "To be deleted" -p testproject`, {
			env,
			encoding: "utf-8",
		}).toString();
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

	it("deletes a decision", () => {
		run(`delete ${decisionId}`);
		expect(() => run(`show ${decisionId}`)).toThrow();
	});

	it("decision no longer appears in list after delete", () => {
		run(`delete ${decisionId}`);
		const output = run("list");
		expect(output).not.toContain("To be deleted");
	});

	it("fails for non-existent ID", () => {
		try {
			run("delete nonexistent-uuid");
			expect.fail("should have thrown");
		} catch (err) {
			const e = err as { stderr: string };
			expect(e.stderr).toContain(
				"Error: Decision 'nonexistent-uuid' not found",
			);
			expect(e.stderr).not.toContain("at ");
		}
	});
});
