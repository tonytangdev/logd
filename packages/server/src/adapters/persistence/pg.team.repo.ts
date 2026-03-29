import type { Team, TeamMember, TeamRole } from "@logd/shared";
import { and, eq, sql } from "drizzle-orm";
import type { TeamRepository } from "../../ports/team.repository.js";
import type { Database } from "./database.js";
import * as schema from "./schema.js";

export class PgTeamRepo implements TeamRepository {
	constructor(private db: Database) {}

	async create(team: Team): Promise<void> {
		await this.db.insert(schema.teams).values({
			id: team.id,
			name: team.name,
			createdAt: team.createdAt,
		});
	}

	async findById(id: string): Promise<Team | null> {
		const rows = await this.db
			.select()
			.from(schema.teams)
			.where(eq(schema.teams.id, id))
			.limit(1);
		return rows[0] ? this.toTeam(rows[0]) : null;
	}

	async findByName(name: string): Promise<Team | null> {
		const rows = await this.db
			.select()
			.from(schema.teams)
			.where(sql`LOWER(${schema.teams.name}) = LOWER(${name})`)
			.limit(1);
		return rows[0] ? this.toTeam(rows[0]) : null;
	}

	async listByUser(userId: string): Promise<Team[]> {
		const rows = await this.db
			.select({
				id: schema.teams.id,
				name: schema.teams.name,
				createdAt: schema.teams.createdAt,
			})
			.from(schema.teams)
			.innerJoin(
				schema.teamMembers,
				eq(schema.teams.id, schema.teamMembers.teamId),
			)
			.where(eq(schema.teamMembers.userId, userId))
			.orderBy(schema.teams.name);
		return rows.map((r) => this.toTeam(r));
	}

	async delete(id: string): Promise<void> {
		await this.db
			.delete(schema.teamMembers)
			.where(eq(schema.teamMembers.teamId, id));
		await this.db.delete(schema.teams).where(eq(schema.teams.id, id));
	}

	async hasProjects(teamId: string): Promise<boolean> {
		const rows = await this.db
			.select({ id: schema.projects.id })
			.from(schema.projects)
			.where(eq(schema.projects.teamId, teamId))
			.limit(1);
		return rows.length > 0;
	}

	async addMember(
		teamId: string,
		userId: string,
		role: TeamRole,
	): Promise<void> {
		await this.db.insert(schema.teamMembers).values({
			teamId,
			userId,
			role,
			createdAt: new Date().toISOString(),
		});
	}

	async removeMember(teamId: string, userId: string): Promise<void> {
		await this.db
			.delete(schema.teamMembers)
			.where(
				and(
					eq(schema.teamMembers.teamId, teamId),
					eq(schema.teamMembers.userId, userId),
				),
			);
	}

	async updateMemberRole(
		teamId: string,
		userId: string,
		role: TeamRole,
	): Promise<void> {
		await this.db
			.update(schema.teamMembers)
			.set({ role })
			.where(
				and(
					eq(schema.teamMembers.teamId, teamId),
					eq(schema.teamMembers.userId, userId),
				),
			);
	}

	async getMembership(
		userId: string,
		teamName: string,
	): Promise<{ teamId: string; role: TeamRole } | null> {
		const rows = await this.db
			.select({
				teamId: schema.teamMembers.teamId,
				role: schema.teamMembers.role,
			})
			.from(schema.teamMembers)
			.innerJoin(
				schema.teams,
				eq(schema.teamMembers.teamId, schema.teams.id),
			)
			.where(
				and(
					eq(schema.teamMembers.userId, userId),
					sql`LOWER(${schema.teams.name}) = LOWER(${teamName})`,
				),
			)
			.limit(1);
		return rows[0]
			? { teamId: rows[0].teamId, role: rows[0].role as TeamRole }
			: null;
	}

	async listMembers(teamId: string): Promise<TeamMember[]> {
		const rows = await this.db
			.select()
			.from(schema.teamMembers)
			.where(eq(schema.teamMembers.teamId, teamId))
			.orderBy(schema.teamMembers.createdAt);
		return rows.map((r) => ({
			userId: r.userId,
			teamId: r.teamId,
			role: r.role as TeamRole,
			createdAt: r.createdAt,
		}));
	}

	private toTeam(row: typeof schema.teams.$inferSelect): Team {
		return { id: row.id, name: row.name, createdAt: row.createdAt };
	}
}
