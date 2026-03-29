import type { PGlite } from "@electric-sql/pglite";
import type { Team } from "@logd/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setupTestDb } from "../../test-utils.js";
import type { Database } from "./database.js";
import { PgTeamRepo } from "./pg.team.repo.js";
import * as schema from "./schema.js";

function makeTeam(overrides?: Partial<Team>): Team {
	return {
		id: "t-1",
		name: "acme",
		createdAt: "2026-01-01T00:00:00.000Z",
		...overrides,
	};
}

async function insertUser(db: Database, id: string) {
	await db.insert(schema.users).values({
		id,
		email: `${id}@example.com`,
		name: id,
		createdAt: "2026-01-01T00:00:00.000Z",
	});
}

describe("PgTeamRepo", () => {
	let db: Database;
	let repo: PgTeamRepo;
	let pglite: PGlite;

	beforeEach(async () => {
		({ db, pglite } = await setupTestDb());
		repo = new PgTeamRepo(db);
	});

	afterEach(async () => {
		await pglite.close();
	});

	it("create + findById round-trips", async () => {
		await repo.create(makeTeam());
		const found = await repo.findById("t-1");
		expect(found).not.toBeNull();
		expect(found?.name).toBe("acme");
		expect(found?.createdAt).toBe("2026-01-01T00:00:00.000Z");
	});

	it("findById returns null for missing", async () => {
		expect(await repo.findById("nope")).toBeNull();
	});

	it("findByName is case-insensitive", async () => {
		await repo.create(makeTeam());
		const found = await repo.findByName("ACME");
		expect(found).not.toBeNull();
		expect(found?.id).toBe("t-1");
	});

	it("findByName returns null for missing", async () => {
		expect(await repo.findByName("nope")).toBeNull();
	});

	it("listByUser returns teams the user belongs to", async () => {
		await insertUser(db, "u-1");
		await repo.create(makeTeam({ id: "t-1", name: "beta" }));
		await repo.create(makeTeam({ id: "t-2", name: "alpha" }));
		await repo.addMember("t-1", "u-1", "member");
		await repo.addMember("t-2", "u-1", "admin");
		const teams = await repo.listByUser("u-1");
		expect(teams).toHaveLength(2);
		// ordered by name
		expect(teams[0].name).toBe("alpha");
		expect(teams[1].name).toBe("beta");
	});

	it("listByUser returns empty for user with no teams", async () => {
		await insertUser(db, "u-1");
		expect(await repo.listByUser("u-1")).toHaveLength(0);
	});

	it("delete cascades team_members", async () => {
		await insertUser(db, "u-1");
		await repo.create(makeTeam());
		await repo.addMember("t-1", "u-1", "admin");
		await repo.delete("t-1");
		expect(await repo.findById("t-1")).toBeNull();
		expect(await repo.listMembers("t-1")).toHaveLength(0);
	});

	it("hasProjects returns false when no projects", async () => {
		await repo.create(makeTeam());
		expect(await repo.hasProjects("t-1")).toBe(false);
	});

	it("hasProjects returns true when project exists", async () => {
		await repo.create(makeTeam());
		await db.insert(schema.projects).values({
			id: "p-1",
			name: "my-proj",
			teamId: "t-1",
			createdAt: "2026-01-01T00:00:00.000Z",
		});
		expect(await repo.hasProjects("t-1")).toBe(true);
	});

	it("addMember + listMembers", async () => {
		await insertUser(db, "u-1");
		await insertUser(db, "u-2");
		await repo.create(makeTeam());
		await repo.addMember("t-1", "u-1", "admin");
		await repo.addMember("t-1", "u-2", "member");
		const members = await repo.listMembers("t-1");
		expect(members).toHaveLength(2);
		expect(members[0].role).toBe("admin");
		expect(members[1].role).toBe("member");
	});

	it("removeMember", async () => {
		await insertUser(db, "u-1");
		await repo.create(makeTeam());
		await repo.addMember("t-1", "u-1", "admin");
		await repo.removeMember("t-1", "u-1");
		expect(await repo.listMembers("t-1")).toHaveLength(0);
	});

	it("updateMemberRole", async () => {
		await insertUser(db, "u-1");
		await repo.create(makeTeam());
		await repo.addMember("t-1", "u-1", "member");
		await repo.updateMemberRole("t-1", "u-1", "admin");
		const members = await repo.listMembers("t-1");
		expect(members[0].role).toBe("admin");
	});

	it("getMembership returns role for existing member", async () => {
		await insertUser(db, "u-1");
		await repo.create(makeTeam());
		await repo.addMember("t-1", "u-1", "admin");
		const m = await repo.getMembership("u-1", "acme");
		expect(m).not.toBeNull();
		expect(m?.teamId).toBe("t-1");
		expect(m?.role).toBe("admin");
	});

	it("getMembership is case-insensitive on team name", async () => {
		await insertUser(db, "u-1");
		await repo.create(makeTeam());
		await repo.addMember("t-1", "u-1", "member");
		const m = await repo.getMembership("u-1", "ACME");
		expect(m).not.toBeNull();
	});

	it("getMembership returns null for non-member", async () => {
		await insertUser(db, "u-1");
		await repo.create(makeTeam());
		expect(await repo.getMembership("u-1", "acme")).toBeNull();
	});
});
