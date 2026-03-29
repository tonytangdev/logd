import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";

export function createDatabase(dbPath: string): Database.Database {
	mkdirSync(dirname(dbPath), { recursive: true });

	const db = new Database(dbPath);

	sqliteVec.load(db);

	db.pragma("journal_mode = WAL");
	db.pragma("foreign_keys = ON");

	// Migrate: recreate decisions_vec with cosine distance if it exists with L2 (default)
	const vecSchema = db
		.prepare(
			"SELECT sql FROM sqlite_master WHERE type='table' AND name='decisions_vec'",
		)
		.get() as { sql: string } | undefined;
	if (vecSchema && !vecSchema.sql.includes("distance_metric=cosine")) {
		db.exec(`
			DROP TABLE decisions_vec;
		`);
	}

	db.exec(`
		CREATE TABLE IF NOT EXISTS projects (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL UNIQUE,
			description TEXT,
			created_at TEXT NOT NULL DEFAULT (datetime('now')),
			server TEXT DEFAULT NULL,
			team TEXT DEFAULT NULL
		);

		CREATE TABLE IF NOT EXISTS decisions (
			id TEXT PRIMARY KEY,
			project TEXT NOT NULL REFERENCES projects(name),
			title TEXT NOT NULL,
			context TEXT,
			alternatives TEXT,
			tags TEXT,
			status TEXT NOT NULL DEFAULT 'active',
			links TEXT,
			created_at TEXT NOT NULL DEFAULT (datetime('now')),
			updated_at TEXT NOT NULL DEFAULT (datetime('now'))
		);

		CREATE VIRTUAL TABLE IF NOT EXISTS decisions_vec USING vec0(
			id TEXT PRIMARY KEY,
			embedding float[1024] distance_metric=cosine
		);
	`);

	const projectColumns = db.pragma("table_info(projects)") as {
		name: string;
	}[];
	const columnNames = projectColumns.map((c) => c.name);
	if (!columnNames.includes("server")) {
		db.exec("ALTER TABLE projects ADD COLUMN server TEXT DEFAULT NULL");
	}
	if (!columnNames.includes("team")) {
		db.exec("ALTER TABLE projects ADD COLUMN team TEXT DEFAULT NULL");
	}

	return db;
}
