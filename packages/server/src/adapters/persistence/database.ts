import type { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { migrate as migratePostgresJs } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "./schema.js";

export type Database = PostgresJsDatabase<typeof schema>;

export async function createDatabase(databaseUrl: string): Promise<Database> {
	const client = postgres(databaseUrl);
	const db = drizzle(client, { schema });
	await db.execute("CREATE EXTENSION IF NOT EXISTS vector");
	await migratePostgresJs(db, { migrationsFolder: "./drizzle" });
	return db;
}

export async function createTestDatabase(pglite: PGlite): Promise<Database> {
	const db = drizzlePglite(pglite, { schema }) as unknown as Database;
	await db.execute("CREATE EXTENSION IF NOT EXISTS vector");
	await migratePglite(db as any, { migrationsFolder: "./drizzle" });
	return db;
}
