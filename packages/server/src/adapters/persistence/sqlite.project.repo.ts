import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { ProjectRepository } from "../../ports/project.repository.js";

export class SqliteProjectRepo implements ProjectRepository {
	constructor(private db: Database.Database) {}

	create(name: string, description: string | null): void {
		this.db
			.prepare(
				"INSERT INTO projects (id, name, description, created_at) VALUES (?, ?, ?, ?)",
			)
			.run(randomUUID(), name, description, new Date().toISOString());
	}

	findByName(name: string): boolean {
		const row = this.db
			.prepare("SELECT 1 FROM projects WHERE LOWER(name) = LOWER(?)")
			.get(name.trim());
		return row !== undefined;
	}
}
