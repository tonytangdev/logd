import type { Team, TeamMember, TeamRole } from "@logd/shared";
import type Database from "better-sqlite3";
import type { TeamRepository } from "../../ports/team.repository.js";

interface TeamRow {
	id: string;
	name: string;
	created_at: string;
}

function rowToTeam(row: TeamRow): Team {
	return { id: row.id, name: row.name, createdAt: row.created_at };
}

interface MemberRow {
	user_id: string;
	team_id: string;
	role: string;
	created_at: string;
}

function rowToMember(row: MemberRow): TeamMember {
	return {
		userId: row.user_id,
		teamId: row.team_id,
		role: row.role as TeamRole,
		createdAt: row.created_at,
	};
}

export class SqliteTeamRepo implements TeamRepository {
	constructor(private db: Database.Database) {}

	create(team: Team): void {
		this.db
			.prepare("INSERT INTO teams (id, name, created_at) VALUES (?, ?, ?)")
			.run(team.id, team.name, team.createdAt);
	}

	findById(id: string): Team | null {
		const row = this.db
			.prepare("SELECT id, name, created_at FROM teams WHERE id = ?")
			.get(id) as TeamRow | undefined;
		return row ? rowToTeam(row) : null;
	}

	findByName(name: string): Team | null {
		const row = this.db
			.prepare(
				"SELECT id, name, created_at FROM teams WHERE LOWER(name) = LOWER(?)",
			)
			.get(name) as TeamRow | undefined;
		return row ? rowToTeam(row) : null;
	}

	listByUser(userId: string): Team[] {
		const rows = this.db
			.prepare(
				`SELECT t.id, t.name, t.created_at
				 FROM teams t
				 JOIN team_members tm ON t.id = tm.team_id
				 WHERE tm.user_id = ?
				 ORDER BY t.name`,
			)
			.all(userId) as TeamRow[];
		return rows.map(rowToTeam);
	}

	delete(id: string): void {
		this.db.prepare("DELETE FROM team_members WHERE team_id = ?").run(id);
		this.db.prepare("DELETE FROM teams WHERE id = ?").run(id);
	}

	hasProjects(teamId: string): boolean {
		const row = this.db
			.prepare("SELECT 1 FROM projects WHERE team_id = ? LIMIT 1")
			.get(teamId);
		return row !== undefined;
	}

	addMember(teamId: string, userId: string, role: TeamRole): void {
		this.db
			.prepare(
				"INSERT INTO team_members (team_id, user_id, role, created_at) VALUES (?, ?, ?, ?)",
			)
			.run(teamId, userId, role, new Date().toISOString());
	}

	removeMember(teamId: string, userId: string): void {
		this.db
			.prepare("DELETE FROM team_members WHERE team_id = ? AND user_id = ?")
			.run(teamId, userId);
	}

	updateMemberRole(teamId: string, userId: string, role: TeamRole): void {
		this.db
			.prepare(
				"UPDATE team_members SET role = ? WHERE team_id = ? AND user_id = ?",
			)
			.run(role, teamId, userId);
	}

	getMembership(
		userId: string,
		teamName: string,
	): { teamId: string; role: TeamRole } | null {
		const row = this.db
			.prepare(
				`SELECT tm.team_id, tm.role
				 FROM team_members tm
				 JOIN teams t ON tm.team_id = t.id
				 WHERE tm.user_id = ? AND LOWER(t.name) = LOWER(?)`,
			)
			.get(userId, teamName) as { team_id: string; role: string } | undefined;
		return row ? { teamId: row.team_id, role: row.role as TeamRole } : null;
	}

	listMembers(teamId: string): TeamMember[] {
		const rows = this.db
			.prepare(
				"SELECT user_id, team_id, role, created_at FROM team_members WHERE team_id = ? ORDER BY created_at",
			)
			.all(teamId) as MemberRow[];
		return rows.map(rowToMember);
	}
}
