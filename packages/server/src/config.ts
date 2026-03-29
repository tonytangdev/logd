export interface Config {
	port: number;
	apiToken: string | undefined;
	dbPath: string;
	ollamaUrl: string;
	model: string;
}

export function loadConfig(): Config {
	return {
		port: Number(process.env.LOGD_PORT) || 3000,
		apiToken: process.env.LOGD_API_TOKEN,
		dbPath: process.env.LOGD_DB_PATH || "./logd-server.db",
		ollamaUrl: process.env.LOGD_OLLAMA_URL || "http://localhost:11434",
		model: process.env.LOGD_MODEL || "qwen3-embedding:0.6b",
	};
}
