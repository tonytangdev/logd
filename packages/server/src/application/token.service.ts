import type { Token } from "@logd/shared";
import { buildToken, generateRawToken, hashToken } from "../domain/token.js";
import type { TokenRepository } from "../ports/token.repository.js";

export class TokenService {
	constructor(private repo: TokenRepository) {}

	create(userId: string, name: string): { raw: string; token: Token } {
		const raw = generateRawToken();
		const hash = hashToken(raw);
		const token = buildToken(userId, name, hash);
		this.repo.create(token, hash);
		return { raw, token };
	}

	createWithRaw(userId: string, name: string, rawToken: string): Token {
		const hash = hashToken(rawToken);
		const token = buildToken(userId, name, hash);
		this.repo.create(token, hash);
		return token;
	}

	authenticate(rawToken: string): { id: string } | null {
		const hash = hashToken(rawToken);
		const result = this.repo.findByHash(hash);
		return result ? { id: result.userId } : null;
	}

	touch(rawToken: string): void {
		const hash = hashToken(rawToken);
		this.repo.touchLastUsed(hash);
	}

	list(userId: string): Token[] {
		return this.repo.listByUser(userId);
	}

	revoke(tokenId: string): void {
		this.repo.delete(tokenId);
	}
}
