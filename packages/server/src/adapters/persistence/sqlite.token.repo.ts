import type Database from "better-sqlite3";
import type { Token } from "@logd/shared";
import type { TokenRepository } from "../../ports/token.repository.js";

interface TokenRow {
	id: string;
	user_id: string;
	token_hash: string;
	name: string;
	created_at: string;
	last_used_at: string | null;
}

function rowToToken(row: TokenRow): Token {
	return {
		id: row.id,
		userId: row.user_id,
		name: row.name,
		createdAt: row.created_at,
		lastUsedAt: row.last_used_at,
	};
}

export class SqliteTokenRepo implements TokenRepository {
	constructor(private db: Database.Database) {}

	create(token: Token, tokenHash: string): void {
		this.db
			.prepare(
				"INSERT INTO tokens (id, user_id, token_hash, name, created_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?)",
			)
			.run(token.id, token.userId, tokenHash, token.name, token.createdAt, token.lastUsedAt);
	}

	findByHash(tokenHash: string): { token: Token; userId: string } | null {
		const row = this.db
			.prepare(
				"SELECT id, user_id, token_hash, name, created_at, last_used_at FROM tokens WHERE token_hash = ?",
			)
			.get(tokenHash) as TokenRow | undefined;
		return row ? { token: rowToToken(row), userId: row.user_id } : null;
	}

	listByUser(userId: string): Token[] {
		const rows = this.db
			.prepare(
				"SELECT id, user_id, token_hash, name, created_at, last_used_at FROM tokens WHERE user_id = ? ORDER BY created_at DESC",
			)
			.all(userId) as TokenRow[];
		return rows.map(rowToToken);
	}

	delete(id: string): void {
		this.db.prepare("DELETE FROM tokens WHERE id = ?").run(id);
	}

	touchLastUsed(tokenHash: string): void {
		this.db
			.prepare("UPDATE tokens SET last_used_at = ? WHERE token_hash = ?")
			.run(new Date().toISOString(), tokenHash);
	}
}
