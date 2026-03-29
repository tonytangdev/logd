import type { User } from "@logd/shared";

export interface UserRepository {
	create(user: User): void;
	findById(id: string): User | null;
	findByEmail(email: string): User | null;
	listByTeam(teamId: string): User[];
	isEmpty(): boolean;
}
