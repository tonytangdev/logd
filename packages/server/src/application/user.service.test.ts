import type { User } from "@logd/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserRepository } from "../ports/user.repository.js";
import type { TokenService } from "./token.service.js";
import { UserService } from "./user.service.js";

function mockUserRepo(): UserRepository {
	const store = new Map<string, User>();
	return {
		create: vi.fn(async (user: User) => {
			store.set(user.id, user);
		}),
		findById: vi.fn(async (id: string) => store.get(id) ?? null),
		findByEmail: vi.fn(async (email: string) => {
			for (const u of store.values()) {
				if (u.email.toLowerCase() === email.toLowerCase()) return u;
			}
			return null;
		}),
		listByTeam: vi.fn(async () => [...store.values()]),
		isEmpty: vi.fn(async () => store.size === 0),
	};
}

function mockTokenService(): Pick<TokenService, "create"> {
	return {
		create: vi.fn(async () => ({
			raw: "raw-token-abc",
			token: {
				id: "tk-1",
				userId: "u-1",
				name: "initial",
				createdAt: "",
				lastUsedAt: null,
			},
		})),
	};
}

describe("UserService", () => {
	let service: UserService;
	let repo: ReturnType<typeof mockUserRepo>;
	let tokenSvc: ReturnType<typeof mockTokenService>;

	beforeEach(() => {
		repo = mockUserRepo();
		tokenSvc = mockTokenService();
		service = new UserService(repo, tokenSvc as TokenService);
	});

	it("create returns user + raw token", async () => {
		const result = await service.create("tony@example.com", "Tony");
		expect(result.user.email).toBe("tony@example.com");
		expect(result.rawToken).toBe("raw-token-abc");
		expect(repo.create).toHaveBeenCalled();
		expect(tokenSvc.create).toHaveBeenCalled();
	});

	it("create throws on duplicate email", async () => {
		await service.create("tony@example.com", "Tony");
		await expect(service.create("tony@example.com", "Tony 2")).rejects.toThrow(
			"already exists",
		);
	});

	it("listByTeam delegates to repo", async () => {
		await service.listByTeam("t-1");
		expect(repo.listByTeam).toHaveBeenCalledWith("t-1");
	});
});
