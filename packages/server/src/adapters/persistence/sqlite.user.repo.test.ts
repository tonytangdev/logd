import type { User } from "@logd/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { createInMemoryDatabase } from "./database.js";
import { SqliteUserRepo } from "./sqlite.user.repo.js";

function makeUser(overrides?: Partial<User>): User {
	return {
		id: "u-1",
		email: "tony@example.com",
		name: "Tony",
		createdAt: "2026-01-01T00:00:00.000Z",
		...overrides,
	};
}

describe("SqliteUserRepo", () => {
	let repo: SqliteUserRepo;

	beforeEach(() => {
		const db = createInMemoryDatabase();
		repo = new SqliteUserRepo(db);
	});

	it("create + findById round-trips", () => {
		repo.create(makeUser());
		const found = repo.findById("u-1");
		expect(found).not.toBeNull();
		expect(found?.email).toBe("tony@example.com");
	});

	it("findById returns null for missing", () => {
		expect(repo.findById("nope")).toBeNull();
	});

	it("findByEmail is case-insensitive", () => {
		repo.create(makeUser());
		const found = repo.findByEmail("Tony@Example.com");
		expect(found).not.toBeNull();
	});

	it("findByEmail returns null for missing", () => {
		expect(repo.findByEmail("nope@example.com")).toBeNull();
	});

	it("throws on duplicate email", () => {
		repo.create(makeUser());
		expect(() => repo.create(makeUser({ id: "u-2" }))).toThrow();
	});

	it("isEmpty returns true on empty DB", () => {
		expect(repo.isEmpty()).toBe(true);
	});

	it("isEmpty returns false after create", () => {
		repo.create(makeUser());
		expect(repo.isEmpty()).toBe(false);
	});

	it("listByTeam returns users in team", () => {
		const db = createInMemoryDatabase();
		const userRepo = new SqliteUserRepo(db);
		userRepo.create(makeUser());
		db.exec(`
			INSERT INTO teams (id, name, created_at) VALUES ('t-1', 'acme', '2026-01-01');
			INSERT INTO team_members (user_id, team_id, role, created_at) VALUES ('u-1', 't-1', 'admin', '2026-01-01');
		`);
		const users = userRepo.listByTeam("t-1");
		expect(users).toHaveLength(1);
		expect(users[0].id).toBe("u-1");
	});
});
