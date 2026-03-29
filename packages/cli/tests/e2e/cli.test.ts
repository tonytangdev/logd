import { exec } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "vitest";

const execAsync = promisify(exec);

describe("E2E: full CLI workflow", { timeout: 30_000 }, () => {
	let tempDir: string;
	let mockOllama: Server;
	let mockPort: number;
	const bin = "node dist/bin/logd.js";

	// Start a mock Ollama server that returns fixed embeddings
	beforeAll(async () => {
		await new Promise<void>((resolve) => {
			mockOllama = createServer((req, res) => {
				let body = "";
				req.on("data", (chunk) => (body += chunk));
				req.on("end", () => {
					const embedding = new Array(1024).fill(0).map((_, i) => Math.sin(i));
					res.writeHead(200, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ embeddings: [embedding] }));
				});
			});
			mockOllama.listen(0, () => {
				const addr = mockOllama.address();
				mockPort = typeof addr === "object" && addr !== null ? addr.port : 0;
				resolve();
			});
		});
	});

	afterAll(() => {
		mockOllama.close();
	});

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "logd-e2e-"));
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	async function run(args: string): Promise<string> {
		const { stdout } = await execAsync(`${bin} ${args}`, {
			env: {
				...process.env,
				LOGD_DB_PATH: join(tempDir, "test.db"),
				LOGD_OLLAMA_URL: `http://localhost:${mockPort}`,
			},
		});
		return stdout.trim();
	}

	async function runOrFail(
		args: string,
	): Promise<{ stdout: string; threw: boolean }> {
		try {
			return { stdout: await run(args), threw: false };
		} catch (e: unknown) {
			const err = e as { stderr?: string; message: string };
			return { stdout: err.stderr ?? err.message, threw: true };
		}
	}

	it("full workflow: create project → add → search → show → edit → list → delete", async () => {
		// 1. Create project
		const createProjectOutput = await run(
			'project create "e2e-project" -d "E2E test project"',
		);
		expect(createProjectOutput).toContain("e2e-project");

		// 2. List projects
		const listProjectsOutput = await run("project list");
		expect(listProjectsOutput).toContain("e2e-project");

		// 3. Add a decision
		const addOutput = await run(
			'add "Use Postgres for persistence" -p e2e-project -c "Need ACID transactions" -t backend -t database',
		);
		expect(addOutput).toContain("Postgres");
		const idMatch = addOutput.match(/[0-9a-f-]{36}/);
		expect(idMatch).not.toBeNull();
		const decisionId = idMatch?.[0];

		// 4. Search for the decision
		const searchOutput = await run('search "database choice"');
		expect(searchOutput).toContain("Postgres");

		// 5. Show the decision
		const showOutput = await run(`show ${decisionId}`);
		expect(showOutput).toContain("Use Postgres");
		expect(showOutput).toContain("ACID");
		expect(showOutput).toContain("backend");

		// 6. Edit the decision
		await run(`edit ${decisionId} -s superseded`);
		const showAfterEdit = await run(`show ${decisionId}`);
		expect(showAfterEdit).toContain("superseded");

		// 7. List decisions
		const listOutput = await run("list -p e2e-project");
		expect(listOutput).toContain("Postgres");

		// 8. Delete the decision
		await run(`delete ${decisionId}`);
		const { threw } = await runOrFail(`show ${decisionId}`);
		expect(threw).toBe(true);
	});

	it("add fails when project does not exist", async () => {
		const { threw } = await runOrFail('add "Test" -p nonexistent');
		expect(threw).toBe(true);
	});

	it("duplicate project creation fails", async () => {
		await run('project create "dup-test"');
		const { threw } = await runOrFail('project create "dup-test"');
		expect(threw).toBe(true);
	});

	it("show non-existent decision fails", async () => {
		const { threw } = await runOrFail(
			"show 00000000-0000-0000-0000-000000000000",
		);
		expect(threw).toBe(true);
	});

	it("delete non-existent decision fails", async () => {
		const { threw } = await runOrFail(
			"delete 00000000-0000-0000-0000-000000000000",
		);
		expect(threw).toBe(true);
	});
});
