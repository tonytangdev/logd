import { isNull } from "drizzle-orm";
import type { Database } from "../adapters/persistence/database.js";
import * as schema from "../adapters/persistence/schema.js";
import { buildTeam } from "../domain/team.js";
import { buildUser } from "../domain/user.js";
import type { TeamRepository } from "../ports/team.repository.js";
import type { UserRepository } from "../ports/user.repository.js";
import type { TokenService } from "./token.service.js";

export interface BootstrapDeps {
	db: Database;
	userRepo: UserRepository;
	teamRepo: TeamRepository;
	tokenService: TokenService;
	apiToken: string | undefined;
}

export async function bootstrap(deps: BootstrapDeps): Promise<void> {
	const { db, userRepo, teamRepo, tokenService, apiToken } = deps;
	if (!(await userRepo.isEmpty()) || !apiToken) return;
	const admin = buildUser("admin@localhost", "Admin");
	await userRepo.create(admin);
	const team = buildTeam("default");
	await teamRepo.create(team);
	await teamRepo.addMember(team.id, admin.id, "admin");
	await tokenService.createWithRaw(admin.id, "bootstrap", apiToken);
	await db
		.update(schema.projects)
		.set({ teamId: team.id })
		.where(isNull(schema.projects.teamId));
}
