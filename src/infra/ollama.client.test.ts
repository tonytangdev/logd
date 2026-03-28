import { afterEach, describe, expect, it, vi } from "vitest";
import { OllamaClient } from "./ollama.client.js";

describe("OllamaClient", () => {
	const originalFetch = globalThis.fetch;

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("sends correct request to /api/embed", async () => {
		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ embeddings: [[0.1, 0.2, 0.3]] }),
		});

		const client = new OllamaClient(
			"http://localhost:11434",
			"qwen3-embedding:0.6b",
		);
		await client.embed("test text");

		expect(fetch).toHaveBeenCalledWith("http://localhost:11434/api/embed", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				model: "qwen3-embedding:0.6b",
				input: "test text",
			}),
		});
	});

	it("returns first embedding from response", async () => {
		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ embeddings: [[0.1, 0.2, 0.3]] }),
		});

		const client = new OllamaClient("http://localhost:11434", "model");
		const result = await client.embed("test");
		expect(result).toEqual([0.1, 0.2, 0.3]);
	});

	it("throws helpful message on connection error", async () => {
		globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("fetch failed"));

		const client = new OllamaClient("http://localhost:11434", "model");
		await expect(client.embed("test")).rejects.toThrow(
			"Cannot connect to Ollama at http://localhost:11434. Is it running?",
		);
	});

	it("throws on non-200 response", async () => {
		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 404,
			statusText: "Not Found",
		});

		const client = new OllamaClient("http://localhost:11434", "model");
		await expect(client.embed("test")).rejects.toThrow(
			"Ollama error: 404 Not Found",
		);
	});

	it("uses custom URL and model", async () => {
		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ embeddings: [[1.0]] }),
		});

		const client = new OllamaClient("http://custom:9999", "my-model");
		await client.embed("hello");

		expect(fetch).toHaveBeenCalledWith(
			"http://custom:9999/api/embed",
			expect.objectContaining({
				body: expect.stringContaining('"model":"my-model"'),
			}),
		);
	});
});
