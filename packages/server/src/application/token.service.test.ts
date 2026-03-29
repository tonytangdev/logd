import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Token } from "@logd/shared";
import type { TokenRepository } from "../ports/token.repository.js";
import { TokenService } from "./token.service.js";

function mockTokenRepo(): TokenRepository {
	const store = new Map<string, { token: Token; hash: string }>();
	return {
		create: vi.fn((token: Token, hash: string) => {
			store.set(hash, { token, hash });
		}),
		findByHash: vi.fn((hash: string) => {
			const entry = store.get(hash);
			return entry ? { token: entry.token, userId: entry.token.userId } : null;
		}),
		listByUser: vi.fn(() => [...store.values()].map((e) => e.token)),
		delete: vi.fn(),
		touchLastUsed: vi.fn(),
	};
}

describe("TokenService", () => {
	let service: TokenService;
	let repo: ReturnType<typeof mockTokenRepo>;

	beforeEach(() => {
		repo = mockTokenRepo();
		service = new TokenService(repo);
	});

	it("create returns raw token and stores hashed", () => {
		const result = service.create("u-1", "laptop");
		expect(result.raw).toHaveLength(64);
		expect(result.token.userId).toBe("u-1");
		expect(repo.create).toHaveBeenCalled();
	});

	it("authenticate returns userId for valid token", () => {
		const { raw } = service.create("u-1", "laptop");
		const result = service.authenticate(raw);
		expect(result).not.toBeNull();
		expect(result?.id).toBe("u-1");
	});

	it("authenticate returns null for invalid token", () => {
		expect(service.authenticate("badtoken")).toBeNull();
	});

	it("touch calls repo.touchLastUsed", () => {
		const { raw } = service.create("u-1", "laptop");
		service.touch(raw);
		expect(repo.touchLastUsed).toHaveBeenCalled();
	});

	it("list delegates to repo", () => {
		service.list("u-1");
		expect(repo.listByUser).toHaveBeenCalledWith("u-1");
	});

	it("revoke delegates to repo", () => {
		service.revoke("tk-1");
		expect(repo.delete).toHaveBeenCalledWith("tk-1");
	});
});
