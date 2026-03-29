import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import {
	createTestDatabase,
	type Database,
} from "./adapters/persistence/database.js";

export async function setupTestDb(): Promise<{ db: Database; pglite: PGlite }> {
	const pglite = await PGlite.create({ extensions: { vector } });
	const db = await createTestDatabase(pglite);
	return { db, pglite };
}
