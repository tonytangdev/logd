import type { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../adapters/persistence/database.js";
import { PgTeamRepo } from "../adapters/persistence/pg.team.repo.js";
import { PgTokenRepo } from "../adapters/persistence/pg.token.repo.js";
import { PgUserRepo } from "../adapters/persistence/pg.user.repo.js";
import * as schema from "../adapters/persistence/schema.js";
import { hashToken } from "../domain/token.js";
import { setupTestDb } from "../test-utils.js";
import { bootstrap } from "./bootstrap.js";
import { TokenService } from "./token.service.js";

describe("bootstrap", () => {
	let db: Database;
	let pglite: PGlite;
	let userRepo: PgUserRepo;
	let teamRepo: PgTeamRepo;
	let tokenRepo: PgTokenRepo;
	let tokenService: TokenService;

	beforeEach(async () => {
		const result = await setupTestDb();
		db = result.db;
		pglite = result.pglite;
		userRepo = new PgUserRepo(db);
		teamRepo = new PgTeamRepo(db);
		tokenRepo = new PgTokenRepo(db);
		tokenService = new TokenService(tokenRepo);
	});

	afterEach(async () => {
		await pglite.close();
	});

	it("seeds admin user + default team on empty DB", async () => {
		await bootstrap({
			db,
			userRepo,
			teamRepo,
			tokenService,
			apiToken: "my-secret",
		});

		expect(await userRepo.isEmpty()).toBe(false);
		const admin = await userRepo.findByEmail("admin@localhost");
		expect(admin).not.toBeNull();

		const team = await teamRepo.findByName("default");
		expect(team).not.toBeNull();

		// biome-ignore lint/style/noNonNullAssertion: asserted above
		const membership = await teamRepo.getMembership(admin!.id, "default");
		expect(membership?.role).toBe("admin");

		const tokenResult = await tokenRepo.findByHash(hashToken("my-secret"));
		expect(tokenResult).not.toBeNull();
	});

	it("assigns existing teamless projects to default team", async () => {
		await db.insert(schema.projects).values({ id: "p-1", name: "old-proj" });

		await bootstrap({
			db,
			userRepo,
			teamRepo,
			tokenService,
			apiToken: "my-secret",
		});

		const [row] = await db
			.select({ teamId: schema.projects.teamId })
			.from(schema.projects)
			.where(eq(schema.projects.id, "p-1"));
		const team = await teamRepo.findByName("default");
		expect(row.teamId).toBe(team?.id);
	});

	it("skips seed when users table is not empty", async () => {
		await bootstrap({
			db,
			userRepo,
			teamRepo,
			tokenService,
			apiToken: "secret1",
		});
		const [count1] = await db
			.select({ c: (await import("drizzle-orm")).count() })
			.from(schema.users);

		await bootstrap({
			db,
			userRepo,
			teamRepo,
			tokenService,
			apiToken: "secret2",
		});
		const [count2] = await db
			.select({ c: (await import("drizzle-orm")).count() })
			.from(schema.users);

		expect(count1.c).toBe(count2.c);
	});

	it("skips seed when no apiToken provided", async () => {
		await bootstrap({
			db,
			userRepo,
			teamRepo,
			tokenService,
			apiToken: undefined,
		});
		expect(await userRepo.isEmpty()).toBe(true);
	});
});
