import type {
	CreateDecisionInput,
	Decision,
	DecisionStatus,
	SearchResult,
	UpdateDecisionInput,
} from "@logd/shared";
import {
	buildDecision,
	buildDocumentTemplate,
	buildQueryTemplate,
} from "../domain/decision.js";
import type { DecisionRepository } from "../ports/decision.repository.js";
import type { EmbeddingProvider } from "../ports/embedding.provider.js";

export class DecisionService {
	constructor(
		private repo: DecisionRepository,
		private embedding: EmbeddingProvider,
	) {}

	async create(input: CreateDecisionInput): Promise<Decision> {
		const decision = buildDecision(input);
		const vector = await this.embedding.embed(buildDocumentTemplate(decision));
		this.repo.create(decision, vector);
		return decision;
	}

	get(id: string): Decision | null {
		return this.repo.findById(id);
	}

	async update(id: string, input: UpdateDecisionInput): Promise<void> {
		const existing = this.repo.findById(id);
		if (!existing) throw new NotFoundError(`Decision '${id}' not found`);

		const merged = { ...existing, ...input };
		const vector = await this.embedding.embed(buildDocumentTemplate(merged));
		this.repo.update(id, input, vector);
	}

	delete(id: string): void {
		this.repo.delete(id);
	}

	list(options?: {
		project?: string;
		status?: DecisionStatus;
		limit?: number;
		teamId?: string;
	}): Decision[] {
		return this.repo.list(options);
	}

	async search(
		project: string,
		query: string,
		threshold: number,
		limit: number,
		teamId?: string,
	): Promise<SearchResult[]> {
		const vector = await this.embedding.embed(buildQueryTemplate(query));
		const results = this.repo.searchByVector(vector, limit, project, teamId);
		return results.filter((r) => r.score >= threshold);
	}
}

export class NotFoundError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "NotFoundError";
	}
}
