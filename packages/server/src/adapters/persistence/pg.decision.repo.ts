import type {
	Decision,
	DecisionStatus,
	SearchResult,
	UpdateDecisionInput,
} from "@logd/shared";
import { and, cosineDistance, desc, eq } from "drizzle-orm";
import type { DecisionRepository } from "../../ports/decision.repository.js";
import type { Database } from "./database.js";
import * as schema from "./schema.js";

export class PgDecisionRepo implements DecisionRepository {
	constructor(private db: Database) {}

	async create(decision: Decision, embedding: number[]): Promise<void> {
		await this.db.insert(schema.decisions).values({
			id: decision.id,
			project: decision.project,
			title: decision.title,
			context: decision.context,
			alternatives: decision.alternatives
				? JSON.stringify(decision.alternatives)
				: null,
			tags: decision.tags ? JSON.stringify(decision.tags) : null,
			status: decision.status,
			links: decision.links ? JSON.stringify(decision.links) : null,
			createdAt: decision.createdAt,
			updatedAt: decision.updatedAt,
		});
		await this.db
			.insert(schema.decisionsVec)
			.values({ id: decision.id, embedding });
	}

	async findById(id: string): Promise<Decision | null> {
		const rows = await this.db
			.select()
			.from(schema.decisions)
			.where(eq(schema.decisions.id, id))
			.limit(1);
		return rows[0] ? this.toDecision(rows[0]) : null;
	}

	async update(
		id: string,
		input: UpdateDecisionInput,
		embedding?: number[],
	): Promise<void> {
		const updates: Record<string, unknown> = {};
		if (input.project !== undefined) updates.project = input.project;
		if (input.title !== undefined) updates.title = input.title;
		if (input.context !== undefined) updates.context = input.context;
		if (input.alternatives !== undefined)
			updates.alternatives = JSON.stringify(input.alternatives);
		if (input.tags !== undefined) updates.tags = JSON.stringify(input.tags);
		if (input.status !== undefined) updates.status = input.status;
		if (input.links !== undefined) updates.links = JSON.stringify(input.links);

		if (Object.keys(updates).length > 0) {
			updates.updatedAt = new Date().toISOString();
			await this.db
				.update(schema.decisions)
				.set(updates)
				.where(eq(schema.decisions.id, id));
		}
		if (embedding) {
			await this.db
				.update(schema.decisionsVec)
				.set({ embedding })
				.where(eq(schema.decisionsVec.id, id));
		}
	}

	async delete(id: string): Promise<void> {
		await this.db
			.delete(schema.decisionsVec)
			.where(eq(schema.decisionsVec.id, id));
		await this.db.delete(schema.decisions).where(eq(schema.decisions.id, id));
	}

	async list(
		options: {
			project?: string;
			status?: DecisionStatus;
			limit?: number;
			teamId?: string;
		} = {},
	): Promise<Decision[]> {
		const limit = options.limit ?? 20;
		const conditions = [];
		if (options.teamId)
			conditions.push(eq(schema.projects.teamId, options.teamId));
		if (options.project)
			conditions.push(eq(schema.decisions.project, options.project));
		if (options.status)
			conditions.push(eq(schema.decisions.status, options.status));

		if (options.teamId) {
			const rows = await this.db
				.select({
					id: schema.decisions.id,
					project: schema.decisions.project,
					title: schema.decisions.title,
					context: schema.decisions.context,
					alternatives: schema.decisions.alternatives,
					tags: schema.decisions.tags,
					status: schema.decisions.status,
					links: schema.decisions.links,
					createdAt: schema.decisions.createdAt,
					updatedAt: schema.decisions.updatedAt,
				})
				.from(schema.decisions)
				.innerJoin(
					schema.projects,
					eq(schema.decisions.project, schema.projects.name),
				)
				.where(and(...conditions))
				.orderBy(desc(schema.decisions.createdAt))
				.limit(limit);
			return rows.map((r) => this.toDecision(r));
		}

		const where = conditions.length > 0 ? and(...conditions) : undefined;
		const rows = await this.db
			.select()
			.from(schema.decisions)
			.where(where)
			.orderBy(desc(schema.decisions.createdAt))
			.limit(limit);
		return rows.map((r) => this.toDecision(r));
	}

	async searchByVector(
		embedding: number[],
		limit: number,
		project?: string,
		teamId?: string,
	): Promise<SearchResult[]> {
		const distance = cosineDistance(schema.decisionsVec.embedding, embedding);
		const vecRows = await this.db
			.select({ id: schema.decisionsVec.id, distance })
			.from(schema.decisionsVec)
			.orderBy(distance)
			.limit(limit);

		const results: SearchResult[] = [];
		for (const row of vecRows) {
			const decision = await this.findById(row.id);
			if (!decision) continue;
			if (project && decision.project !== project) continue;
			if (teamId) {
				const projectRows = await this.db
					.select({ teamId: schema.projects.teamId })
					.from(schema.projects)
					.where(eq(schema.projects.name, decision.project))
					.limit(1);
				if (!projectRows[0] || projectRows[0].teamId !== teamId) continue;
			}
			results.push({ decision, score: 1 - Number(row.distance) });
		}
		return results;
	}

	private toDecision(row: typeof schema.decisions.$inferSelect): Decision {
		return {
			id: row.id,
			project: row.project,
			title: row.title,
			context: row.context,
			alternatives: row.alternatives ? JSON.parse(row.alternatives) : null,
			tags: row.tags ? JSON.parse(row.tags) : null,
			status: row.status as DecisionStatus,
			links: row.links ? JSON.parse(row.links) : null,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
		};
	}
}
