import type { Team, TeamMember, TeamRole } from "@logd/shared";
import { buildTeam } from "../domain/team.js";
import type { TeamRepository } from "../ports/team.repository.js";
import { ConflictError } from "./project.service.js";

export class TeamService {
	constructor(private repo: TeamRepository) {}

	async create(name: string): Promise<Team> {
		if (await this.repo.findByName(name)) {
			throw new ConflictError(`Team '${name}' already exists`);
		}
		const team = buildTeam(name);
		await this.repo.create(team);
		return team;
	}

	async delete(teamId: string): Promise<void> {
		if (await this.repo.hasProjects(teamId)) {
			throw new BadRequestError("Cannot delete team with existing projects");
		}
		await this.repo.delete(teamId);
	}

	async listByUser(userId: string): Promise<Team[]> {
		return this.repo.listByUser(userId);
	}

	async addMember(
		teamId: string,
		userId: string,
		role: TeamRole,
	): Promise<void> {
		await this.repo.addMember(teamId, userId, role);
	}

	async removeMember(teamId: string, userId: string): Promise<void> {
		await this.repo.removeMember(teamId, userId);
	}

	async updateMemberRole(
		teamId: string,
		userId: string,
		role: TeamRole,
	): Promise<void> {
		await this.repo.updateMemberRole(teamId, userId, role);
	}

	async getMembership(
		userId: string,
		teamName: string,
	): Promise<{ teamId: string; role: TeamRole } | null> {
		return this.repo.getMembership(userId, teamName);
	}

	async listMembers(teamId: string): Promise<TeamMember[]> {
		return this.repo.listMembers(teamId);
	}
}

export class BadRequestError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "BadRequestError";
	}
}
