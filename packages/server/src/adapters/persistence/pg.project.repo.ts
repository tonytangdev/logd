import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { ProjectRepository } from "../../ports/project.repository.js";
import type { Database } from "./database.js";
import * as schema from "./schema.js";

export class PgProjectRepo implements ProjectRepository {
	constructor(private db: Database) {}

	async create(
		name: string,
		description: string | null,
		teamId: string,
	): Promise<void> {
		await this.db.insert(schema.projects).values({
			id: randomUUID(),
			name,
			description,
			teamId,
			createdAt: new Date().toISOString(),
		});
	}

	async findByName(name: string): Promise<boolean> {
		const rows = await this.db
			.select({ id: schema.projects.id })
			.from(schema.projects)
			.where(sql`LOWER(${schema.projects.name}) = LOWER(${name.trim()})`)
			.limit(1);
		return rows.length > 0;
	}
}
