import type {
	Decision,
	DecisionStatus,
	SearchResult,
	UpdateDecisionInput,
} from "@logd/shared";
import type Database from "better-sqlite3";
import type { DecisionRepository } from "../../ports/decision.repository.js";

interface DecisionRow {
	id: string;
	project: string;
	title: string;
	context: string | null;
	alternatives: string | null;
	tags: string | null;
	status: string;
	links: string | null;
	created_at: string;
	updated_at: string;
}

function rowToDecision(row: DecisionRow): Decision {
	return {
		id: row.id,
		project: row.project,
		title: row.title,
		context: row.context,
		alternatives: row.alternatives ? JSON.parse(row.alternatives) : null,
		tags: row.tags ? JSON.parse(row.tags) : null,
		status: row.status as DecisionStatus,
		links: row.links ? JSON.parse(row.links) : null,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

export class SqliteDecisionRepo implements DecisionRepository {
	constructor(private db: Database.Database) {}

	create(decision: Decision, embedding: number[]): void {
		this.db
			.prepare(
				`INSERT INTO decisions (id, project, title, context, alternatives, tags, status, links, created_at, updated_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			)
			.run(
				decision.id,
				decision.project,
				decision.title,
				decision.context,
				decision.alternatives ? JSON.stringify(decision.alternatives) : null,
				decision.tags ? JSON.stringify(decision.tags) : null,
				decision.status,
				decision.links ? JSON.stringify(decision.links) : null,
				decision.createdAt,
				decision.updatedAt,
			);

		this.db
			.prepare("INSERT INTO decisions_vec (id, embedding) VALUES (?, ?)")
			.run(decision.id, new Float32Array(embedding));
	}

	findById(id: string): Decision | null {
		const row = this.db
			.prepare(
				"SELECT id, project, title, context, alternatives, tags, status, links, created_at, updated_at FROM decisions WHERE id = ?",
			)
			.get(id) as DecisionRow | undefined;
		return row ? rowToDecision(row) : null;
	}

	update(id: string, input: UpdateDecisionInput, embedding?: number[]): void {
		const setClauses: string[] = [];
		const values: unknown[] = [];

		if (input.project !== undefined) {
			setClauses.push("project = ?");
			values.push(input.project);
		}
		if (input.title !== undefined) {
			setClauses.push("title = ?");
			values.push(input.title);
		}
		if (input.context !== undefined) {
			setClauses.push("context = ?");
			values.push(input.context);
		}
		if (input.alternatives !== undefined) {
			setClauses.push("alternatives = ?");
			values.push(JSON.stringify(input.alternatives));
		}
		if (input.tags !== undefined) {
			setClauses.push("tags = ?");
			values.push(JSON.stringify(input.tags));
		}
		if (input.status !== undefined) {
			setClauses.push("status = ?");
			values.push(input.status);
		}
		if (input.links !== undefined) {
			setClauses.push("links = ?");
			values.push(JSON.stringify(input.links));
		}

		if (setClauses.length > 0) {
			setClauses.push("updated_at = ?");
			values.push(new Date().toISOString());
			this.db
				.prepare(`UPDATE decisions SET ${setClauses.join(", ")} WHERE id = ?`)
				.run(...values, id);
		}

		if (embedding) {
			this.db
				.prepare("UPDATE decisions_vec SET embedding = ? WHERE id = ?")
				.run(new Float32Array(embedding), id);
		}
	}

	delete(id: string): void {
		this.db.prepare("DELETE FROM decisions WHERE id = ?").run(id);
		this.db.prepare("DELETE FROM decisions_vec WHERE id = ?").run(id);
	}

	list(
		options: {
			project?: string;
			status?: DecisionStatus;
			limit?: number;
			teamId?: string;
		} = {},
	): Decision[] {
		const conditions: string[] = [];
		const values: unknown[] = [];
		const limit = options.limit ?? 20;

		if (options.teamId) {
			if (options.project) {
				conditions.push("d.project = ?");
				values.push(options.project);
			}
			if (options.status) {
				conditions.push("d.status = ?");
				values.push(options.status);
			}
			const where =
				conditions.length > 0 ? `AND ${conditions.join(" AND ")}` : "";
			const rows = this.db
				.prepare(
					`SELECT d.id, d.project, d.title, d.context, d.alternatives, d.tags, d.status, d.links, d.created_at, d.updated_at
					 FROM decisions d JOIN projects p ON d.project = p.name
					 WHERE p.team_id = ? ${where} ORDER BY d.created_at DESC LIMIT ?`,
				)
				.all(options.teamId, ...values, limit) as DecisionRow[];
			return rows.map(rowToDecision);
		}

		if (options.project) {
			conditions.push("project = ?");
			values.push(options.project);
		}
		if (options.status) {
			conditions.push("status = ?");
			values.push(options.status);
		}

		const where =
			conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

		const rows = this.db
			.prepare(
				`SELECT id, project, title, context, alternatives, tags, status, links, created_at, updated_at
				 FROM decisions ${where} ORDER BY created_at DESC LIMIT ?`,
			)
			.all(...values, limit) as DecisionRow[];

		return rows.map(rowToDecision);
	}

	searchByVector(
		embedding: number[],
		limit: number,
		project?: string,
		teamId?: string,
	): SearchResult[] {
		const rows = this.db
			.prepare(
				`SELECT v.id, v.distance
				 FROM decisions_vec v
				 WHERE embedding MATCH ?
				 ORDER BY v.distance
				 LIMIT ?`,
			)
			.all(new Float32Array(embedding), limit) as {
			id: string;
			distance: number;
		}[];

		const results: SearchResult[] = [];
		for (const row of rows) {
			const decision = this.findById(row.id);
			if (!decision) continue;
			if (project && decision.project !== project) continue;
			if (teamId) {
				const projectRow = this.db
					.prepare("SELECT team_id FROM projects WHERE name = ?")
					.get(decision.project) as { team_id: string } | undefined;
				if (!projectRow || projectRow.team_id !== teamId) continue;
			}
			results.push({ decision, score: 1 - row.distance });
		}

		return results;
	}
}
