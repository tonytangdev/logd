import type { User } from "@logd/shared";

export interface UserRepository {
	create(user: User): Promise<void>;
	findById(id: string): Promise<User | null>;
	findByEmail(email: string): Promise<User | null>;
	listByTeam(teamId: string): Promise<User[]>;
	isEmpty(): Promise<boolean>;
}
