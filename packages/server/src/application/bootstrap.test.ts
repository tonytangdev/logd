import type Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { createInMemoryDatabase } from "../adapters/persistence/database.js";
import { SqliteTeamRepo } from "../adapters/persistence/sqlite.team.repo.js";
import { SqliteTokenRepo } from "../adapters/persistence/sqlite.token.repo.js";
import { SqliteUserRepo } from "../adapters/persistence/sqlite.user.repo.js";
import { hashToken } from "../domain/token.js";
import { bootstrap } from "./bootstrap.js";
import { TokenService } from "./token.service.js";

describe("bootstrap", () => {
	let db: Database.Database;
	let userRepo: SqliteUserRepo;
	let teamRepo: SqliteTeamRepo;
	let tokenRepo: SqliteTokenRepo;
	let tokenService: TokenService;

	beforeEach(() => {
		db = createInMemoryDatabase();
		userRepo = new SqliteUserRepo(db);
		teamRepo = new SqliteTeamRepo(db);
		tokenRepo = new SqliteTokenRepo(db);
		tokenService = new TokenService(tokenRepo);
	});

	it("seeds admin user + default team on empty DB", () => {
		bootstrap({ db, userRepo, teamRepo, tokenService, apiToken: "my-secret" });

		expect(userRepo.isEmpty()).toBe(false);
		const admin = userRepo.findByEmail("admin@localhost");
		expect(admin).not.toBeNull();

		const team = teamRepo.findByName("default");
		expect(team).not.toBeNull();

		const membership = teamRepo.getMembership(admin?.id, "default");
		expect(membership?.role).toBe("admin");

		const tokenResult = tokenRepo.findByHash(hashToken("my-secret"));
		expect(tokenResult).not.toBeNull();
	});

	it("assigns existing teamless projects to default team", () => {
		db.exec(
			"INSERT INTO projects (id, name, created_at) VALUES ('p-1', 'old-proj', '2026-01-01')",
		);

		bootstrap({ db, userRepo, teamRepo, tokenService, apiToken: "my-secret" });

		const row = db
			.prepare("SELECT team_id FROM projects WHERE id = 'p-1'")
			.get() as { team_id: string };
		const team = teamRepo.findByName("default");
		expect(row.team_id).toBe(team?.id);
	});

	it("skips seed when users table is not empty", () => {
		bootstrap({ db, userRepo, teamRepo, tokenService, apiToken: "secret1" });
		const userCount1 = db.prepare("SELECT COUNT(*) as c FROM users").get() as {
			c: number;
		};

		bootstrap({ db, userRepo, teamRepo, tokenService, apiToken: "secret2" });
		const userCount2 = db.prepare("SELECT COUNT(*) as c FROM users").get() as {
			c: number;
		};

		expect(userCount1.c).toBe(userCount2.c);
	});

	it("skips seed when no apiToken provided", () => {
		bootstrap({ db, userRepo, teamRepo, tokenService, apiToken: undefined });
		expect(userRepo.isEmpty()).toBe(true);
	});
});
