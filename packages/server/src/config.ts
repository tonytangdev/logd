export interface Config {
	port: number;
	apiToken: string;
	dbPath: string;
	ollamaUrl: string;
	model: string;
}

export function loadConfig(): Config {
	const apiToken = process.env.LOGD_API_TOKEN;
	if (!apiToken) {
		throw new Error("LOGD_API_TOKEN is required");
	}

	return {
		port: Number(process.env.LOGD_PORT) || 3000,
		apiToken,
		dbPath: process.env.LOGD_DB_PATH || "./logd-server.db",
		ollamaUrl: process.env.LOGD_OLLAMA_URL || "http://localhost:11434",
		model: process.env.LOGD_MODEL || "qwen3-embedding:0.6b",
	};
}
