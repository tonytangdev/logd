import type { EmbeddingProvider } from "../../ports/embedding.provider.js";

export class OllamaProvider implements EmbeddingProvider {
	constructor(
		private readonly url: string,
		private readonly model: string,
	) {}

	async embed(text: string): Promise<number[]> {
		let response: Response;
		try {
			response = await fetch(`${this.url}/api/embed`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ model: this.model, input: text }),
			});
		} catch {
			throw new Error(
				`Cannot connect to Ollama at ${this.url}. Is it running?`,
			);
		}

		if (!response.ok) {
			throw new Error(
				`Ollama error: ${response.status} ${response.statusText}`,
			);
		}

		const data = await response.json();
		return data.embeddings[0];
	}
}
