import type { Token } from "@logd/shared";

export interface TokenRepository {
	create(token: Token, tokenHash: string): Promise<void>;
	findByHash(tokenHash: string): Promise<{ token: Token; userId: string } | null>;
	listByUser(userId: string): Promise<Token[]>;
	delete(id: string): Promise<void>;
	touchLastUsed(tokenHash: string): Promise<void>;
}
