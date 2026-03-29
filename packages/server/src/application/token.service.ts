import type { Token } from "@logd/shared";
import { buildToken, generateRawToken, hashToken } from "../domain/token.js";
import type { TokenRepository } from "../ports/token.repository.js";

export class TokenService {
	constructor(private repo: TokenRepository) {}

	async create(
		userId: string,
		name: string,
	): Promise<{ raw: string; token: Token }> {
		const raw = generateRawToken();
		const hash = hashToken(raw);
		const token = buildToken(userId, name, hash);
		await this.repo.create(token, hash);
		return { raw, token };
	}

	async createWithRaw(
		userId: string,
		name: string,
		rawToken: string,
	): Promise<Token> {
		const hash = hashToken(rawToken);
		const token = buildToken(userId, name, hash);
		await this.repo.create(token, hash);
		return token;
	}

	async authenticate(rawToken: string): Promise<{ id: string } | null> {
		const hash = hashToken(rawToken);
		const result = await this.repo.findByHash(hash);
		return result ? { id: result.userId } : null;
	}

	async touch(rawToken: string): Promise<void> {
		const hash = hashToken(rawToken);
		await this.repo.touchLastUsed(hash);
	}

	async list(userId: string): Promise<Token[]> {
		return this.repo.listByUser(userId);
	}

	async revoke(tokenId: string): Promise<void> {
		await this.repo.delete(tokenId);
	}
}
