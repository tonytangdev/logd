import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("CLI edit command", { timeout: 30_000 }, () => {
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
			`${bin} add "Original Title" -p testproject -c "Original context" -t old-tag`,
			{ env, encoding: "utf-8" },
		).toString();
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

	it("updates status", () => {
		run(`edit ${decisionId} -s superseded`);
		const output = run(`show ${decisionId}`);
		expect(output).toContain("superseded");
	});

	it("updates title", () => {
		run(`edit ${decisionId} --title "New Title"`);
		const output = run(`show ${decisionId}`);
		expect(output).toContain("New Title");
	});

	it("replaces tags entirely", () => {
		run(`edit ${decisionId} -t new-tag-1 -t new-tag-2`);
		const output = run(`show ${decisionId}`);
		expect(output).toContain("new-tag-1");
		expect(output).toContain("new-tag-2");
		expect(output).not.toContain("old-tag");
	});

	it("preserves unchanged fields", () => {
		run(`edit ${decisionId} -s deprecated`);
		const output = run(`show ${decisionId}`);
		expect(output).toContain("Original Title");
		expect(output).toContain("Original context");
	});

	it("fails for non-existent ID", () => {
		expect(() => run("edit nonexistent-uuid -s active")).toThrow();
	});
});
