import { describe, it, expect, beforeEach, vi } from "vitest";
import type { User } from "@logd/shared";
import type { UserRepository } from "../ports/user.repository.js";
import type { TokenService } from "./token.service.js";
import { UserService } from "./user.service.js";

function mockUserRepo(): UserRepository {
	const store = new Map<string, User>();
	return {
		create: vi.fn((user: User) => { store.set(user.id, user); }),
		findById: vi.fn((id: string) => store.get(id) ?? null),
		findByEmail: vi.fn((email: string) => {
			for (const u of store.values()) {
				if (u.email.toLowerCase() === email.toLowerCase()) return u;
			}
			return null;
		}),
		listByTeam: vi.fn(() => [...store.values()]),
		isEmpty: vi.fn(() => store.size === 0),
	};
}

function mockTokenService(): Pick<TokenService, "create"> {
	return {
		create: vi.fn(() => ({
			raw: "raw-token-abc",
			token: { id: "tk-1", userId: "u-1", name: "initial", createdAt: "", lastUsedAt: null },
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
		service = new UserService(repo, tokenSvc as any);
	});

	it("create returns user + raw token", () => {
		const result = service.create("tony@example.com", "Tony");
		expect(result.user.email).toBe("tony@example.com");
		expect(result.rawToken).toBe("raw-token-abc");
		expect(repo.create).toHaveBeenCalled();
		expect(tokenSvc.create).toHaveBeenCalled();
	});

	it("create throws on duplicate email", () => {
		service.create("tony@example.com", "Tony");
		expect(() => service.create("tony@example.com", "Tony 2")).toThrow("already exists");
	});

	it("listByTeam delegates to repo", () => {
		service.listByTeam("t-1");
		expect(repo.listByTeam).toHaveBeenCalledWith("t-1");
	});
});
