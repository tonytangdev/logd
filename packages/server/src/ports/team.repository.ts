import type { Team, TeamMember, TeamRole } from "@logd/shared";

export interface TeamRepository {
	create(team: Team): void;
	findById(id: string): Team | null;
	findByName(name: string): Team | null;
	listByUser(userId: string): Team[];
	delete(id: string): void;
	hasProjects(teamId: string): boolean;

	addMember(teamId: string, userId: string, role: TeamRole): void;
	removeMember(teamId: string, userId: string): void;
	updateMemberRole(teamId: string, userId: string, role: TeamRole): void;
	getMembership(
		userId: string,
		teamName: string,
	): { teamId: string; role: TeamRole } | null;
	listMembers(teamId: string): TeamMember[];
}
