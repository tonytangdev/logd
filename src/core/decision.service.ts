import { randomUUID } from "node:crypto";
import type { BackendFactory } from "./backend.factory.js";
import type {
	CreateDecisionInput,
	Decision,
	DecisionStatus,
	IProjectRepo,
	LocalDecisionSearch,
	Project,
	RemoteDecisionSearch,
	SearchInput,
	SearchResult,
	UpdateDecisionInput,
} from "./types.js";

export class DecisionService {
	constructor(
		private projectRepo: IProjectRepo,
		private backendFactory: BackendFactory,
	) {}

	async create(input: CreateDecisionInput): Promise<Decision> {
		const project = this.resolveProject(input.project);
		const { decisions, embeddings } = this.backendFactory.forProject(project);

		const now = new Date().toISOString();
		const decision: Decision = {
			id: randomUUID(),
			project: input.project,
			title: input.title,
			context: input.context ?? null,
			alternatives: input.alternatives ?? null,
			tags: input.tags ?? null,
			status: input.status ?? "active",
			links: input.links ?? null,
			createdAt: now,
			updatedAt: now,
		};

		const embedding = embeddings ? await embeddings.embedDecision(decision) : [];
		await decisions.create(decision, embedding);
		return decision;
	}

	async getById(id: string): Promise<Decision> {
		const decision = await this.backendFactory.localBackend().decisions.findById(id);
		if (!decision) {
			throw new Error(`Decision '${id}' not found`);
		}
		return decision;
	}

	async update(id: string, input: UpdateDecisionInput): Promise<Decision> {
		const existing = await this.backendFactory.localBackend().decisions.findById(id);
		if (!existing) {
			throw new Error(`Decision '${id}' not found`);
		}

		if (input.project !== undefined) {
			this.resolveProject(input.project);
		}

		const project = this.projectRepo.findByName(existing.project);
		const { decisions, embeddings } = this.backendFactory.forProject(project!);

		const updated: Decision = {
			...existing,
			project: input.project !== undefined ? input.project : existing.project,
			title: input.title !== undefined ? input.title : existing.title,
			context: input.context !== undefined ? input.context : existing.context,
			alternatives: input.alternatives !== undefined ? input.alternatives : existing.alternatives,
			tags: input.tags !== undefined ? input.tags : existing.tags,
			status: input.status !== undefined ? input.status : existing.status,
			links: input.links !== undefined ? input.links : existing.links,
			updatedAt: new Date(
				Math.max(Date.now(), new Date(existing.updatedAt).getTime() + 1),
			).toISOString(),
		};

		const embedding = embeddings ? await embeddings.embedDecision(updated) : undefined;
		await decisions.update(id, input, embedding);
		return updated;
	}

	async delete(id: string): Promise<void> {
		const decision = await this.backendFactory.localBackend().decisions.findById(id);
		if (!decision) {
			throw new Error(`Decision '${id}' not found`);
		}
		const project = this.projectRepo.findByName(decision.project);
		const { decisions } = this.backendFactory.forProject(project!);
		await decisions.delete(id);
	}

	async list(options: {
		project?: string;
		status?: DecisionStatus;
		limit?: number;
	}): Promise<Decision[]> {
		if (options.project) {
			const project = this.resolveProject(options.project);
			const { decisions } = this.backendFactory.forProject(project);
			return decisions.list({
				project: options.project,
				status: options.status,
				limit: options.limit ?? 20,
			});
		}
		return this.backendFactory.localBackend().decisions.list({
			status: options.status,
			limit: options.limit ?? 20,
		});
	}

	async search(input: SearchInput): Promise<SearchResult[]> {
		const limit = input.limit ?? 5;
		const threshold = input.threshold ?? 0;

		if (input.project) {
			const project = this.resolveProject(input.project);
			const { search, embeddings } = this.backendFactory.forProject(project);

			if (embeddings && "searchByVector" in search) {
				return this.localSearch(search as LocalDecisionSearch, embeddings, input);
			}
			return (search as RemoteDecisionSearch).searchByQuery(
				input.project, input.query, threshold, limit,
			);
		}

		const { search, embeddings } = this.backendFactory.localBackend();
		return this.localSearch(search, embeddings, input);
	}

	private async localSearch(
		search: LocalDecisionSearch,
		embeddings: { embedQuery(q: string): Promise<number[]> },
		input: SearchInput,
	): Promise<SearchResult[]> {
		const embedding = await embeddings.embedQuery(input.query);
		const results = await search.searchByVector(embedding, input.limit ?? 5, input.project);
		return results.filter((r) => {
			if (r.score <= 0) return false;
			if (input.threshold !== undefined && r.score < input.threshold) return false;
			return true;
		});
	}

	private resolveProject(name: string): Project {
		const project = this.projectRepo.findByName(name);
		if (!project) {
			const all = this.projectRepo.list();
			const names = all.length > 0 ? all.map((p) => p.name).join(", ") : "none";
			throw new Error(`Project '${name}' not found. Available projects: ${names}`);
		}
		return project;
	}
}
