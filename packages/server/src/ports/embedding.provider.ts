export interface EmbeddingProvider {
	embed(text: string): Promise<number[]>;
}
