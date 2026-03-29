import type { Token } from "@logd/shared";
import { eq } from "drizzle-orm";
import type { TokenRepository } from "../../ports/token.repository.js";
import type { Database } from "./database.js";
import * as schema from "./schema.js";

export class PgTokenRepo implements TokenRepository {
	constructor(private db: Database) {}

	async create(token: Token, tokenHash: string): Promise<void> {
		await this.db.insert(schema.tokens).values({
			id: token.id,
			userId: token.userId,
			tokenHash,
			name: token.name,
			createdAt: token.createdAt,
			lastUsedAt: token.lastUsedAt,
		});
	}

	async findByHash(
		tokenHash: string,
	): Promise<{ token: Token; userId: string } | null> {
		const rows = await this.db
			.select()
			.from(schema.tokens)
			.where(eq(schema.tokens.tokenHash, tokenHash))
			.limit(1);
		if (!rows[0]) return null;
		const row = rows[0];
		return {
			token: {
				id: row.id,
				userId: row.userId,
				name: row.name,
				createdAt: row.createdAt,
				lastUsedAt: row.lastUsedAt,
			},
			userId: row.userId,
		};
	}

	async listByUser(userId: string): Promise<Token[]> {
		const rows = await this.db
			.select()
			.from(schema.tokens)
			.where(eq(schema.tokens.userId, userId))
			.orderBy(schema.tokens.createdAt);
		return rows.map((r) => ({
			id: r.id,
			userId: r.userId,
			name: r.name,
			createdAt: r.createdAt,
			lastUsedAt: r.lastUsedAt,
		}));
	}

	async delete(id: string): Promise<void> {
		await this.db.delete(schema.tokens).where(eq(schema.tokens.id, id));
	}

	async touchLastUsed(tokenHash: string): Promise<void> {
		await this.db
			.update(schema.tokens)
			.set({ lastUsedAt: new Date().toISOString() })
			.where(eq(schema.tokens.tokenHash, tokenHash));
	}
}
