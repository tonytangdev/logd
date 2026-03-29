import type { Team } from "@logd/shared";
import type Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { createInMemoryDatabase } from "./database.js";
import { SqliteTeamRepo } from "./sqlite.team.repo.js";
import { SqliteUserRepo } from "./sqlite.user.repo.js";

function makeTeam(overrides?: Partial<Team>): Team {
	return {
		id: "t-1",
		name: "acme",
		createdAt: "2026-01-01T00:00:00.000Z",
		...overrides,
	};
}

describe("SqliteTeamRepo", () => {
	let db: Database.Database;
	let repo: SqliteTeamRepo;

	beforeEach(() => {
		db = createInMemoryDatabase();
		repo = new SqliteTeamRepo(db);
	});

	it("create + findById round-trips", () => {
		repo.create(makeTeam());
		const found = repo.findById("t-1");
		expect(found).not.toBeNull();
		expect(found?.name).toBe("acme");
	});

	it("findByName is case-insensitive", () => {
		repo.create(makeTeam());
		expect(repo.findByName("ACME")).not.toBeNull();
	});

	it("findByName returns null for missing", () => {
		expect(repo.findByName("nope")).toBeNull();
	});

	it("throws on duplicate team name", () => {
		repo.create(makeTeam());
		expect(() => repo.create(makeTeam({ id: "t-2" }))).toThrow();
	});

	it("delete removes team", () => {
		repo.create(makeTeam());
		repo.delete("t-1");
		expect(repo.findById("t-1")).toBeNull();
	});

	it("hasProjects returns false for empty team", () => {
		repo.create(makeTeam());
		expect(repo.hasProjects("t-1")).toBe(false);
	});

	it("hasProjects returns true when team has projects", () => {
		repo.create(makeTeam());
		db.exec(
			"INSERT INTO projects (id, name, team_id, created_at) VALUES ('p-1', 'proj', 't-1', '2026-01-01')",
		);
		expect(repo.hasProjects("t-1")).toBe(true);
	});

	describe("membership", () => {
		beforeEach(() => {
			repo.create(makeTeam());
			const userRepo = new SqliteUserRepo(db);
			userRepo.create({
				id: "u-1",
				email: "tony@example.com",
				name: "Tony",
				createdAt: "2026-01-01T00:00:00.000Z",
			});
		});

		it("addMember + getMembership", () => {
			repo.addMember("t-1", "u-1", "admin");
			const m = repo.getMembership("u-1", "acme");
			expect(m).not.toBeNull();
			expect(m?.teamId).toBe("t-1");
			expect(m?.role).toBe("admin");
		});

		it("getMembership returns null for non-member", () => {
			expect(repo.getMembership("u-1", "acme")).toBeNull();
		});

		it("removeMember", () => {
			repo.addMember("t-1", "u-1", "admin");
			repo.removeMember("t-1", "u-1");
			expect(repo.getMembership("u-1", "acme")).toBeNull();
		});

		it("updateMemberRole", () => {
			repo.addMember("t-1", "u-1", "member");
			repo.updateMemberRole("t-1", "u-1", "admin");
			const m = repo.getMembership("u-1", "acme");
			expect(m?.role).toBe("admin");
		});

		it("listMembers returns all members", () => {
			repo.addMember("t-1", "u-1", "admin");
			const members = repo.listMembers("t-1");
			expect(members).toHaveLength(1);
			expect(members[0].userId).toBe("u-1");
		});

		it("listByUser returns user's teams", () => {
			repo.addMember("t-1", "u-1", "admin");
			const teams = repo.listByUser("u-1");
			expect(teams).toHaveLength(1);
			expect(teams[0].name).toBe("acme");
		});
	});
});
