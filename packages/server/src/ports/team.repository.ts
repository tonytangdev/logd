import type { Team, TeamMember, TeamRole } from "@logd/shared";

export interface TeamRepository {
	create(team: Team): Promise<void>;
	findById(id: string): Promise<Team | null>;
	findByName(name: string): Promise<Team | null>;
	listByUser(userId: string): Promise<Team[]>;
	delete(id: string): Promise<void>;
	hasProjects(teamId: string): Promise<boolean>;

	addMember(teamId: string, userId: string, role: TeamRole): Promise<void>;
	removeMember(teamId: string, userId: string): Promise<void>;
	updateMemberRole(teamId: string, userId: string, role: TeamRole): Promise<void>;
	getMembership(
		userId: string,
		teamName: string,
	): Promise<{ teamId: string; role: TeamRole } | null>;
	listMembers(teamId: string): Promise<TeamMember[]>;
}
