import type {
	Decision,
	DecisionStatus,
	IDecisionRepo,
	SearchResult,
	UpdateDecisionInput,
} from "../core/types.js";

export class LocalDecisionBackend {
	constructor(private repo: IDecisionRepo) {}

	async create(decision: Decision, embedding: number[]): Promise<void> {
		this.repo.create(decision, embedding);
	}

	async findById(id: string): Promise<Decision | null> {
		return this.repo.findById(id);
	}

	async update(
		id: string,
		input: UpdateDecisionInput,
		embedding?: number[],
	): Promise<void> {
		this.repo.update(id, input, embedding);
	}

	async delete(id: string): Promise<void> {
		this.repo.delete(id);
	}

	async list(options?: {
		project?: string;
		status?: DecisionStatus;
		limit?: number;
	}): Promise<Decision[]> {
		return this.repo.list(options);
	}

	async searchByVector(
		embedding: number[],
		limit: number,
		project?: string,
	): Promise<SearchResult[]> {
		return this.repo.searchByVector(embedding, limit, project);
	}
}
