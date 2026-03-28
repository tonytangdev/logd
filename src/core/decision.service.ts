import { randomUUID } from "node:crypto";
import type { EmbeddingService } from "./embedding.service.js";
import type {
	CreateDecisionInput,
	Decision,
	DecisionStatus,
	IDecisionRepo,
	IProjectRepo,
	SearchInput,
	SearchResult,
	UpdateDecisionInput,
} from "./types.js";

export class DecisionService {
	private decisionRepo: IDecisionRepo;
	private projectRepo: IProjectRepo;
	private embeddingService: EmbeddingService;

	constructor(
		decisionRepo: IDecisionRepo,
		projectRepo: IProjectRepo,
		embeddingService: EmbeddingService,
	) {
		this.decisionRepo = decisionRepo;
		this.projectRepo = projectRepo;
		this.embeddingService = embeddingService;
	}

	async create(input: CreateDecisionInput): Promise<Decision> {
		await this.validateProject(input.project);

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

		const embedding = await this.embeddingService.embedDecision(decision);
		this.decisionRepo.create(decision, embedding);
		return decision;
	}

	getById(id: string): Decision {
		const decision = this.decisionRepo.findById(id);
		if (!decision) {
			throw new Error(`Decision '${id}' not found`);
		}
		return decision;
	}

	async update(id: string, input: UpdateDecisionInput): Promise<Decision> {
		const existing = this.decisionRepo.findById(id);
		if (!existing) {
			throw new Error(`Decision '${id}' not found`);
		}

		if (input.project !== undefined) {
			await this.validateProject(input.project);
		}

		const updated: Decision = {
			...existing,
			project: input.project !== undefined ? input.project : existing.project,
			title: input.title !== undefined ? input.title : existing.title,
			context: input.context !== undefined ? input.context : existing.context,
			alternatives:
				input.alternatives !== undefined
					? input.alternatives
					: existing.alternatives,
			tags: input.tags !== undefined ? input.tags : existing.tags,
			status: input.status !== undefined ? input.status : existing.status,
			links: input.links !== undefined ? input.links : existing.links,
			updatedAt: new Date(
				Math.max(Date.now(), new Date(existing.updatedAt).getTime() + 1),
			).toISOString(),
		};

		const embedding = await this.embeddingService.embedDecision(updated);
		this.decisionRepo.update(id, input, embedding);
		return updated;
	}

	delete(id: string): void {
		const decision = this.decisionRepo.findById(id);
		if (!decision) {
			throw new Error(`Decision '${id}' not found`);
		}
		this.decisionRepo.delete(id);
	}

	list(options: {
		project?: string;
		status?: DecisionStatus;
		limit?: number;
	}): Decision[] {
		return this.decisionRepo.list({
			project: options.project,
			status: options.status,
			limit: options.limit ?? 20,
		});
	}

	async search(input: SearchInput): Promise<SearchResult[]> {
		const embedding = await this.embeddingService.embedQuery(input.query);
		const limit = input.limit ?? 5;
		const results = this.decisionRepo.searchByVector(
			embedding,
			limit,
			input.project,
		);

		return results.filter((r) => {
			if (r.score <= 0) return false;
			if (input.threshold !== undefined && r.score < input.threshold)
				return false;
			return true;
		});
	}

	private async validateProject(name: string): Promise<void> {
		const project = this.projectRepo.findByName(name);
		if (!project) {
			const all = this.projectRepo.list();
			const names = all.length > 0 ? all.map((p) => p.name).join(", ") : "none";
			throw new Error(
				`Project '${name}' not found. Available projects: ${names}`,
			);
		}
	}
}
