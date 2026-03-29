import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Team, TeamMember, TeamRole } from "@logd/shared";
import type { TeamRepository } from "../ports/team.repository.js";
import { TeamService } from "./team.service.js";

function mockTeamRepo(): TeamRepository & { _setHasProjects: (v: boolean) => void } {
	const teams = new Map<string, Team>();
	const members = new Map<string, TeamMember[]>();
	let projectsExist = false;

	return {
		create: vi.fn((team: Team) => { teams.set(team.id, team); }),
		findById: vi.fn((id: string) => teams.get(id) ?? null),
		findByName: vi.fn((name: string) => {
			for (const t of teams.values()) {
				if (t.name.toLowerCase() === name.toLowerCase()) return t;
			}
			return null;
		}),
		listByUser: vi.fn(() => [...teams.values()]),
		delete: vi.fn((id: string) => { teams.delete(id); }),
		hasProjects: vi.fn(() => projectsExist),
		addMember: vi.fn((teamId: string, userId: string, role: TeamRole) => {
			const list = members.get(teamId) ?? [];
			list.push({ teamId, userId, role, createdAt: "" });
			members.set(teamId, list);
		}),
		removeMember: vi.fn(),
		updateMemberRole: vi.fn(),
		getMembership: vi.fn((userId: string, teamName: string) => {
			for (const [tid, list] of members.entries()) {
				const team = teams.get(tid);
				if (team?.name.toLowerCase() === teamName.toLowerCase()) {
					const m = list.find((m) => m.userId === userId);
					if (m) return { teamId: tid, role: m.role };
				}
			}
			return null;
		}),
		listMembers: vi.fn((teamId: string) => members.get(teamId) ?? []),
		_setHasProjects: (v: boolean) => { projectsExist = v; },
	};
}

describe("TeamService", () => {
	let service: TeamService;
	let repo: ReturnType<typeof mockTeamRepo>;

	beforeEach(() => {
		repo = mockTeamRepo();
		service = new TeamService(repo);
	});

	it("create builds and stores team", () => {
		const team = service.create("acme");
		expect(team.name).toBe("acme");
		expect(repo.create).toHaveBeenCalled();
	});

	it("create throws on duplicate name", () => {
		service.create("acme");
		expect(() => service.create("acme")).toThrow("already exists");
	});

	it("delete removes team", () => {
		const team = service.create("acme");
		service.delete(team.id);
		expect(repo.delete).toHaveBeenCalledWith(team.id);
	});

	it("delete throws when team has projects", () => {
		const team = service.create("acme");
		repo._setHasProjects(true);
		expect(() => service.delete(team.id)).toThrow("Cannot delete");
	});

	it("listByUser delegates to repo", () => {
		service.listByUser("u-1");
		expect(repo.listByUser).toHaveBeenCalledWith("u-1");
	});

	it("addMember delegates to repo", () => {
		service.addMember("t-1", "u-1", "admin");
		expect(repo.addMember).toHaveBeenCalled();
	});

	it("removeMember delegates to repo", () => {
		service.removeMember("t-1", "u-1");
		expect(repo.removeMember).toHaveBeenCalledWith("t-1", "u-1");
	});

	it("updateMemberRole delegates to repo", () => {
		service.updateMemberRole("t-1", "u-1", "admin");
		expect(repo.updateMemberRole).toHaveBeenCalledWith("t-1", "u-1", "admin");
	});

	it("getMembership delegates to repo", () => {
		service.getMembership("u-1", "acme");
		expect(repo.getMembership).toHaveBeenCalledWith("u-1", "acme");
	});
});
