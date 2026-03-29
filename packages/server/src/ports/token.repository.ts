import type { Token } from "@logd/shared";

export interface TokenRepository {
	create(token: Token, tokenHash: string): void;
	findByHash(tokenHash: string): { token: Token; userId: string } | null;
	listByUser(userId: string): Token[];
	delete(id: string): void;
	touchLastUsed(tokenHash: string): void;
}
