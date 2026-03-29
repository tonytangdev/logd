import type {
	Decision,
	DecisionStatus,
	SearchResult,
	UpdateDecisionInput,
} from "@logd/shared";

export interface DecisionRepository {
	create(decision: Decision, embedding: number[]): void;
	findById(id: string): Decision | null;
	update(id: string, input: UpdateDecisionInput, embedding?: number[]): void;
	delete(id: string): void;
	list(options?: {
		project?: string;
		status?: DecisionStatus;
		limit?: number;
	}): Decision[];
	searchByVector(
		embedding: number[],
		limit: number,
		project?: string,
	): SearchResult[];
}
