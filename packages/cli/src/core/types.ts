export {
	DECISION_STATUSES,
	type CreateDecisionInput,
	type Decision,
	type DecisionStatus,
	type Project,
	type SearchInput,
	type SearchResult,
	type UpdateDecisionInput,
} from "@logd/shared";

import type {
	Decision,
	DecisionStatus,
	Project,
	SearchResult,
	UpdateDecisionInput,
} from "@logd/shared";

export interface IProjectRepo {
	create(project: Project): void;
	findByName(name: string): Project | null;
	list(): Project[];
}

export interface IDecisionRepo {
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

export interface IEmbeddingClient {
	embed(input: string): Promise<number[]>;
}

export interface DecisionBackend {
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
	}): Promise<Decision[]>;
}

export interface LocalDecisionSearch {
	searchByVector(
		embedding: number[],
		limit: number,
		project?: string,
	): Promise<SearchResult[]>;
}

export interface RemoteDecisionSearch {
	searchByQuery(
		project: string,
		query: string,
		threshold: number,
		limit: number,
	): Promise<SearchResult[]>;
}
