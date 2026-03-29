import { homedir } from "node:os";
import { join } from "node:path";

export interface Config {
	ollamaUrl: string;
	model: string;
	dbPath: string;
}

export interface ConfigOverrides {
	ollamaUrl?: string;
	model?: string;
	dbPath?: string;
}

const DEFAULTS: Config = {
	ollamaUrl: "http://localhost:11434",
	model: "qwen3-embedding:0.6b",
	dbPath: join(homedir(), ".logd", "logd.db"),
};

export function resolveConfig(overrides?: ConfigOverrides): Config {
	return {
		ollamaUrl:
			overrides?.ollamaUrl ?? process.env.LOGD_OLLAMA_URL ?? DEFAULTS.ollamaUrl,
		model: overrides?.model ?? process.env.LOGD_MODEL ?? DEFAULTS.model,
		dbPath: overrides?.dbPath ?? process.env.LOGD_DB_PATH ?? DEFAULTS.dbPath,
	};
}
