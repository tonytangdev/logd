import type { Token } from "@logd/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TokenRepository } from "../ports/token.repository.js";
import { TokenService } from "./token.service.js";

function mockTokenRepo(): TokenRepository {
	const store = new Map<string, { token: Token; hash: string }>();
	return {
		create: vi.fn(async (token: Token, hash: string) => {
			store.set(hash, { token, hash });
		}),
		findByHash: vi.fn(async (hash: string) => {
			const entry = store.get(hash);
			return entry ? { token: entry.token, userId: entry.token.userId } : null;
		}),
		listByUser: vi.fn(async () => [...store.values()].map((e) => e.token)),
		delete: vi.fn(async () => {}),
		touchLastUsed: vi.fn(async () => {}),
	};
}

describe("TokenService", () => {
	let service: TokenService;
	let repo: ReturnType<typeof mockTokenRepo>;

	beforeEach(() => {
		repo = mockTokenRepo();
		service = new TokenService(repo);
	});

	it("create returns raw token and stores hashed", async () => {
		const result = await service.create("u-1", "laptop");
		expect(result.raw).toHaveLength(64);
		expect(result.token.userId).toBe("u-1");
		expect(repo.create).toHaveBeenCalled();
	});

	it("authenticate returns userId for valid token", async () => {
		const { raw } = await service.create("u-1", "laptop");
		const result = await service.authenticate(raw);
		expect(result).not.toBeNull();
		expect(result?.id).toBe("u-1");
	});

	it("authenticate returns null for invalid token", async () => {
		expect(await service.authenticate("badtoken")).toBeNull();
	});

	it("touch calls repo.touchLastUsed", async () => {
		const { raw } = await service.create("u-1", "laptop");
		await service.touch(raw);
		expect(repo.touchLastUsed).toHaveBeenCalled();
	});

	it("list delegates to repo", async () => {
		await service.list("u-1");
		expect(repo.listByUser).toHaveBeenCalledWith("u-1");
	});

	it("revoke delegates to repo", async () => {
		await service.revoke("tk-1");
		expect(repo.delete).toHaveBeenCalledWith("tk-1");
	});
});
