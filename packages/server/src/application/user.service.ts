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

	create(email: string, name: string): { user: User; rawToken: string } {
		if (this.repo.findByEmail(email)) {
			throw new ConflictError(`User with email '${email}' already exists`);
		}
		const user = buildUser(email, name);
		this.repo.create(user);
		const { raw } = this.tokenService.create(user.id, "initial");
		return { user, rawToken: raw };
	}

	listByTeam(teamId: string): User[] {
		return this.repo.listByTeam(teamId);
	}
}
