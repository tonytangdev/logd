import type { DecisionStatus, IEmbeddingClient } from "./types.js";

interface DocumentInput {
	title: string;
	context?: string | null;
	alternatives?: string[] | null;
	tags?: string[] | null;
	status?: DecisionStatus | string;
}

export function buildDocumentTemplate(input: DocumentInput): string {
	const lines: string[] = [`Decision: ${input.title}`];

	if (input.context) {
		lines.push(`Context: ${input.context}`);
	}

	if (input.alternatives && input.alternatives.length > 0) {
		lines.push(`Alternatives: ${input.alternatives.join(", ")}`);
	}

	if (input.tags && input.tags.length > 0) {
		lines.push(`Tags: ${input.tags.join(", ")}`);
	}

	if (input.status) {
		lines.push(`Status: ${input.status}`);
	}

	return lines.join("\n");
}

export function buildQueryTemplate(query: string): string {
	return `Instruct: Given a question about past decisions, retrieve relevant decision records\nQuery: ${query}`;
}

export class EmbeddingService {
	private client: IEmbeddingClient;

	constructor(client: IEmbeddingClient) {
		this.client = client;
	}

	async embedDecision(input: DocumentInput): Promise<number[]> {
		const text = buildDocumentTemplate(input);
		return this.client.embed(text);
	}

	async embedQuery(query: string): Promise<number[]> {
		const text = buildQueryTemplate(query);
		return this.client.embed(text);
	}
}
