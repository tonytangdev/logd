import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveConfig } from "./config.js";

describe("resolveConfig", () => {
	const originalEnv = process.env;

	beforeEach(() => {
		process.env = { ...originalEnv };
		delete process.env.LOGD_OLLAMA_URL;
		delete process.env.LOGD_MODEL;
		delete process.env.LOGD_DB_PATH;
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	it("returns defaults when no overrides or env vars", () => {
		const config = resolveConfig();
		expect(config.ollamaUrl).toBe("http://localhost:11434");
		expect(config.model).toBe("qwen3-embedding:0.6b");
		expect(config.dbPath).toContain(".logd/logd.db");
	});

	it("env vars override defaults", () => {
		process.env.LOGD_OLLAMA_URL = "http://custom:9999";
		process.env.LOGD_MODEL = "custom-model";
		process.env.LOGD_DB_PATH = "/tmp/test.db";

		const config = resolveConfig();
		expect(config.ollamaUrl).toBe("http://custom:9999");
		expect(config.model).toBe("custom-model");
		expect(config.dbPath).toBe("/tmp/test.db");
	});

	it("CLI flag overrides override env vars", () => {
		process.env.LOGD_OLLAMA_URL = "http://env:9999";

		const config = resolveConfig({ ollamaUrl: "http://flag:8888" });
		expect(config.ollamaUrl).toBe("http://flag:8888");
	});

	it("CLI flag overrides override defaults", () => {
		const config = resolveConfig({ model: "flag-model" });
		expect(config.model).toBe("flag-model");
	});

	it("partial overrides only affect specified fields", () => {
		const config = resolveConfig({ model: "custom" });
		expect(config.ollamaUrl).toBe("http://localhost:11434");
		expect(config.model).toBe("custom");
		expect(config.dbPath).toContain(".logd/logd.db");
	});

	it("empty overrides object behaves like no overrides", () => {
		const config = resolveConfig({});
		expect(config.ollamaUrl).toBe("http://localhost:11434");
	});
});
