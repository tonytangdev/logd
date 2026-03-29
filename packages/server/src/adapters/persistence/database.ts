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
		CREATE TABLE IF NOT EXISTS projects (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL UNIQUE,
			description TEXT,
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
	`);

	return db;
}

export function createInMemoryDatabase(): Database.Database {
	return createDatabase(":memory:");
}
