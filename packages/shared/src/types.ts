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
