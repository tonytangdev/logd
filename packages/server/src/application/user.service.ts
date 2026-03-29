import type { User } from "@logd/shared";
import { buildUser } from "../domain/user.js";
import type { UserRepository } from "../ports/user.repository.js";
import { ConflictError } from "./project.service.js";
import type { TokenService } from "./token.service.js";

export class UserService {
	constructor(
		private repo: UserRepository,
		private tokenService: TokenService,
	) {}

	async create(email: string, name: string): Promise<{ user: User; rawToken: string }> {
		if (await this.repo.findByEmail(email)) {
			throw new ConflictError(`User with email '${email}' already exists`);
		}
		const user = buildUser(email, name);
		await this.repo.create(user);
		const { raw } = await this.tokenService.create(user.id, "initial");
		return { user, rawToken: raw };
	}

	async listByTeam(teamId: string): Promise<User[]> {
		return this.repo.listByTeam(teamId);
	}
}
