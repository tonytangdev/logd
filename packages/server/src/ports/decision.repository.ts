import type {
	Decision,
	DecisionStatus,
	SearchResult,
	UpdateDecisionInput,
} from "@logd/shared";

export interface DecisionRepository {
	create(decision: Decision, embedding: number[]): Promise<void>;
	findById(id: string): Promise<Decision | null>;
	update(
		id: string,
		input: UpdateDecisionInput,
		embedding?: number[],
	): Promise<void>;
	delete(id: string): Promise<void>;
	list(options?: {
		project?: string;
		status?: DecisionStatus;
		limit?: number;
		teamId?: string;
	}): Promise<Decision[]>;
	searchByVector(
		embedding: number[],
		limit: number,
		project?: string,
		teamId?: string,
	): Promise<SearchResult[]>;
}
