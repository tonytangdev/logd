export interface Config {
	port: number;
	apiToken: string | undefined;
	databaseUrl: string;
	ollamaUrl: string;
	model: string;
}

export function loadConfig(): Config {
	return {
		port: Number(process.env.LOGD_PORT) || 3000,
		apiToken: process.env.LOGD_API_TOKEN,
		databaseUrl:
			process.env.DATABASE_URL || "postgresql://logd:logd@localhost:5432/logd",
		ollamaUrl: process.env.LOGD_OLLAMA_URL || "http://localhost:11434",
		model: process.env.LOGD_MODEL || "qwen3-embedding:0.6b",
	};
}
