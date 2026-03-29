import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Token } from "@logd/shared";

export function generateRawToken(): string {
	return randomBytes(32).toString("hex");
}

export function hashToken(raw: string): string {
	return createHash("sha256").update(raw).digest("hex");
}

export function buildToken(
	userId: string,
	name: string,
	_tokenHash: string,
): Token {
	return {
		id: randomUUID(),
		userId,
		name,
		createdAt: new Date().toISOString(),
		lastUsedAt: null,
	};
}
