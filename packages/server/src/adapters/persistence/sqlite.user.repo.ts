import type { User } from "@logd/shared";
import type Database from "better-sqlite3";
import type { UserRepository } from "../../ports/user.repository.js";

interface UserRow {
	id: string;
	email: string;
	name: string;
	created_at: string;
}

function rowToUser(row: UserRow): User {
	return {
		id: row.id,
		email: row.email,
		name: row.name,
		createdAt: row.created_at,
	};
}

export class SqliteUserRepo implements UserRepository {
	constructor(private db: Database.Database) {}

	create(user: User): void {
		this.db
			.prepare(
				"INSERT INTO users (id, email, name, created_at) VALUES (?, ?, ?, ?)",
			)
			.run(user.id, user.email, user.name, user.createdAt);
	}

	findById(id: string): User | null {
		const row = this.db
			.prepare("SELECT id, email, name, created_at FROM users WHERE id = ?")
			.get(id) as UserRow | undefined;
		return row ? rowToUser(row) : null;
	}

	findByEmail(email: string): User | null {
		const row = this.db
			.prepare(
				"SELECT id, email, name, created_at FROM users WHERE LOWER(email) = LOWER(?)",
			)
			.get(email) as UserRow | undefined;
		return row ? rowToUser(row) : null;
	}

	listByTeam(teamId: string): User[] {
		const rows = this.db
			.prepare(
				`SELECT u.id, u.email, u.name, u.created_at
				 FROM users u
				 JOIN team_members tm ON u.id = tm.user_id
				 WHERE tm.team_id = ?
				 ORDER BY u.name`,
			)
			.all(teamId) as UserRow[];
		return rows.map(rowToUser);
	}

	isEmpty(): boolean {
		const row = this.db.prepare("SELECT 1 FROM users LIMIT 1").get();
		return row === undefined;
	}
}
