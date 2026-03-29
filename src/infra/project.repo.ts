import type Database from "better-sqlite3";
import type { IProjectRepo, Project } from "../core/types.js";

interface ProjectRow {
	id: string;
	name: string;
	description: string | null;
	created_at: string;
	server: string | null;
	team: string | null;
}

function rowToProject(row: ProjectRow): Project {
	return {
		id: row.id,
		name: row.name,
		description: row.description,
		createdAt: row.created_at,
		server: row.server ?? null,
		team: row.team ?? null,
	};
}

export class ProjectRepo implements IProjectRepo {
	private db: Database.Database;

	constructor(db: Database.Database) {
		this.db = db;
	}

	create(project: Project): void {
		this.db
			.prepare(
				"INSERT INTO projects (id, name, description, created_at, server, team) VALUES (?, ?, ?, ?, ?, ?)",
			)
			.run(project.id, project.name, project.description, project.createdAt, project.server, project.team);
	}

	findByName(name: string): Project | null {
		const row = this.db
			.prepare(
				"SELECT id, name, description, created_at, server, team FROM projects WHERE LOWER(name) = LOWER(?)",
			)
			.get(name.trim()) as ProjectRow | undefined;
		return row ? rowToProject(row) : null;
	}

	list(): Project[] {
		const rows = this.db
			.prepare(
				"SELECT id, name, description, created_at, server, team FROM projects ORDER BY name",
			)
			.all() as ProjectRow[];
		return rows.map(rowToProject);
	}
}
