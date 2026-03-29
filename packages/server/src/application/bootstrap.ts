import type Database from "better-sqlite3";
import { buildTeam } from "../domain/team.js";
import { buildUser } from "../domain/user.js";
import type { SqliteTeamRepo } from "../adapters/persistence/sqlite.team.repo.js";
import type { SqliteUserRepo } from "../adapters/persistence/sqlite.user.repo.js";
import type { TokenService } from "./token.service.js";

export interface BootstrapDeps {
	db: Database.Database;
	userRepo: SqliteUserRepo;
	teamRepo: SqliteTeamRepo;
	tokenService: TokenService;
	apiToken: string | undefined;
}

export function bootstrap(deps: BootstrapDeps): void {
	const { db, userRepo, teamRepo, tokenService, apiToken } = deps;

	if (!userRepo.isEmpty() || !apiToken) return;

	const admin = buildUser("admin@localhost", "Admin");
	userRepo.create(admin);

	const team = buildTeam("default");
	teamRepo.create(team);

	teamRepo.addMember(team.id, admin.id, "admin");

	tokenService.createWithRaw(admin.id, "bootstrap", apiToken);

	db.prepare("UPDATE projects SET team_id = ? WHERE team_id IS NULL").run(team.id);
}
