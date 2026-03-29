export const DECISION_STATUSES = [
	"active",
	"superseded",
	"deprecated",
] as const;

export type DecisionStatus = (typeof DECISION_STATUSES)[number];

export interface Decision {
	id: string;
	project: string;
	title: string;
	context: string | null;
	alternatives: string[] | null;
	tags: string[] | null;
	status: DecisionStatus;
	links: string[] | null;
	createdAt: string;
	updatedAt: string;
}

export interface Project {
	id: string;
	name: string;
	description: string | null;
	createdAt: string;
	server: string | null;
	team: string | null;
}

export interface CreateDecisionInput {
	project: string;
	title: string;
	context?: string;
	alternatives?: string[];
	tags?: string[];
	status?: DecisionStatus;
	links?: string[];
}

export interface UpdateDecisionInput {
	project?: string;
	title?: string;
	context?: string;
	alternatives?: string[];
	tags?: string[];
	status?: DecisionStatus;
	links?: string[];
}

export interface SearchInput {
	query: string;
	project?: string;
	limit?: number;
	threshold?: number;
}

export interface SearchResult {
	decision: Decision;
	score: number;
}

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
