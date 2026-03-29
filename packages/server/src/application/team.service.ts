import type { Team, TeamMember, TeamRole } from "@logd/shared";
import { buildTeam } from "../domain/team.js";
import type { TeamRepository } from "../ports/team.repository.js";
import { ConflictError } from "./project.service.js";

export class TeamService {
	constructor(private repo: TeamRepository) {}

	create(name: string): Team {
		if (this.repo.findByName(name)) {
			throw new ConflictError(`Team '${name}' already exists`);
		}
		const team = buildTeam(name);
		this.repo.create(team);
		return team;
	}

	delete(teamId: string): void {
		if (this.repo.hasProjects(teamId)) {
			throw new BadRequestError("Cannot delete team with existing projects");
		}
		this.repo.delete(teamId);
	}

	listByUser(userId: string): Team[] {
		return this.repo.listByUser(userId);
	}

	addMember(teamId: string, userId: string, role: TeamRole): void {
		this.repo.addMember(teamId, userId, role);
	}

	removeMember(teamId: string, userId: string): void {
		this.repo.removeMember(teamId, userId);
	}

	updateMemberRole(teamId: string, userId: string, role: TeamRole): void {
		this.repo.updateMemberRole(teamId, userId, role);
	}

	getMembership(
		userId: string,
		teamName: string,
	): { teamId: string; role: TeamRole } | null {
		return this.repo.getMembership(userId, teamName);
	}

	listMembers(teamId: string): TeamMember[] {
		return this.repo.listMembers(teamId);
	}
}

export class BadRequestError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "BadRequestError";
	}
}
