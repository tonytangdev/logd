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

	db.exec(`
		CREATE TABLE IF NOT EXISTS users (
			id TEXT PRIMARY KEY,
			email TEXT NOT NULL UNIQUE,
			name TEXT NOT NULL,
			created_at TEXT NOT NULL DEFAULT (datetime('now'))
		);

		CREATE TABLE IF NOT EXISTS teams (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL UNIQUE,
			created_at TEXT NOT NULL DEFAULT (datetime('now'))
		);

		CREATE TABLE IF NOT EXISTS team_members (
			user_id TEXT NOT NULL REFERENCES users(id),
			team_id TEXT NOT NULL REFERENCES teams(id),
			role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
			created_at TEXT NOT NULL DEFAULT (datetime('now')),
			PRIMARY KEY (user_id, team_id)
		);

		CREATE TABLE IF NOT EXISTS tokens (
			id TEXT PRIMARY KEY,
			user_id TEXT NOT NULL REFERENCES users(id),
			token_hash TEXT NOT NULL UNIQUE,
			name TEXT NOT NULL,
			created_at TEXT NOT NULL DEFAULT (datetime('now')),
			last_used_at TEXT
		);

		CREATE TABLE IF NOT EXISTS projects (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL UNIQUE,
			description TEXT,
			team_id TEXT REFERENCES teams(id),
			created_at TEXT NOT NULL DEFAULT (datetime('now'))
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

		CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_name_team ON projects(name, team_id);
	`);

	// Migration: add team_id to projects if missing
	const projectColumns = db.pragma("table_info(projects)") as {
		name: string;
	}[];
	const columnNames = projectColumns.map((c) => c.name);
	if (!columnNames.includes("team_id")) {
		db.exec(
			"ALTER TABLE projects ADD COLUMN team_id TEXT REFERENCES teams(id)",
		);
	}

	return db;
}

export function createInMemoryDatabase(): Database.Database {
	return createDatabase(":memory:");
}
