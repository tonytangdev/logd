import type { User } from "@logd/shared";
import { eq, sql } from "drizzle-orm";
import type { UserRepository } from "../../ports/user.repository.js";
import type { Database } from "./database.js";
import * as schema from "./schema.js";

export class PgUserRepo implements UserRepository {
	constructor(private db: Database) {}

	async create(user: User): Promise<void> {
		await this.db.insert(schema.users).values({
			id: user.id,
			email: user.email,
			name: user.name,
			createdAt: user.createdAt,
		});
	}

	async findById(id: string): Promise<User | null> {
		const rows = await this.db
			.select()
			.from(schema.users)
			.where(eq(schema.users.id, id))
			.limit(1);
		return rows[0] ? this.toUser(rows[0]) : null;
	}

	async findByEmail(email: string): Promise<User | null> {
		const rows = await this.db
			.select()
			.from(schema.users)
			.where(sql`LOWER(${schema.users.email}) = LOWER(${email})`)
			.limit(1);
		return rows[0] ? this.toUser(rows[0]) : null;
	}

	async listByTeam(teamId: string): Promise<User[]> {
		const rows = await this.db
			.select({
				id: schema.users.id,
				email: schema.users.email,
				name: schema.users.name,
				createdAt: schema.users.createdAt,
			})
			.from(schema.users)
			.innerJoin(
				schema.teamMembers,
				eq(schema.users.id, schema.teamMembers.userId),
			)
			.where(eq(schema.teamMembers.teamId, teamId))
			.orderBy(schema.users.name);
		return rows.map((r) => this.toUser(r));
	}

	async isEmpty(): Promise<boolean> {
		const rows = await this.db
			.select({ id: schema.users.id })
			.from(schema.users)
			.limit(1);
		return rows.length === 0;
	}

	private toUser(row: typeof schema.users.$inferSelect): User {
		return {
			id: row.id,
			email: row.email,
			name: row.name,
			createdAt: row.createdAt,
		};
	}
}
