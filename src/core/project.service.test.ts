import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectService } from "./project.service.js";
import type { IProjectRepo, Project } from "./types.js";

function createMockProjectRepo(): IProjectRepo {
	const store = new Map<string, Project>();
	return {
		create: vi.fn((project: Project) => {
			store.set(project.name, project);
		}),
		findByName: vi.fn((name: string) => store.get(name) ?? null),
		list: vi.fn(() => Array.from(store.values())),
	};
}

describe("ProjectService", () => {
	let repo: IProjectRepo;
	let service: ProjectService;

	beforeEach(() => {
		repo = createMockProjectRepo();
		service = new ProjectService(repo);
	});

	describe("create", () => {
		it("creates a project with normalized name", () => {
			const result = service.create("  My Project  ");
			expect(result.name).toBe("my project");
		});

		it("lowercases the name", () => {
			const result = service.create("MyProject");
			expect(result.name).toBe("myproject");
		});

		it("generates a UUID", () => {
			const result = service.create("test");
			expect(result.id).toBeDefined();
			expect(result.id.length).toBeGreaterThan(0);
		});

		it("sets createdAt", () => {
			const result = service.create("test");
			expect(result.createdAt).toBeDefined();
		});

		it("stores description when provided", () => {
			const result = service.create("test", "A test project");
			expect(result.description).toBe("A test project");
		});

		it("sets description to null when not provided", () => {
			const result = service.create("test");
			expect(result.description).toBeNull();
		});

		it("delegates to repo", () => {
			service.create("test");
			expect(repo.create).toHaveBeenCalledWith(
				expect.objectContaining({ name: "test" }),
			);
		});

		it("throws on duplicate name", () => {
			service.create("test");
			expect(() => service.create("test")).toThrow(
				"Project 'test' already exists",
			);
		});

		it("throws on duplicate after normalization", () => {
			service.create("MyProject");
			expect(() => service.create("  myproject  ")).toThrow(
				"Project 'myproject' already exists",
			);
		});
	});

	describe("create with server/team", () => {
		it("stores server and team", () => {
			const result = service.create(
				"remote",
				"desc",
				"https://api.example.com",
				"acme",
			);
			expect(result.server).toBe("https://api.example.com");
			expect(result.team).toBe("acme");
		});

		it("local project has null server/team", () => {
			const result = service.create("local");
			expect(result.server).toBeNull();
			expect(result.team).toBeNull();
		});

		it("throws when server without team", () => {
			expect(() =>
				service.create("test", undefined, "https://api.example.com"),
			).toThrow("--team is required");
		});

		it("throws when team without server", () => {
			expect(() =>
				service.create("test", undefined, undefined, "acme"),
			).toThrow("--server is required");
		});
	});

	describe("list", () => {
		it("returns all projects", () => {
			service.create("alpha");
			service.create("beta");
			const projects = service.list();
			expect(projects).toHaveLength(2);
		});

		it("returns empty array when no projects", () => {
			expect(service.list()).toEqual([]);
		});

		it("delegates to repo", () => {
			service.list();
			expect(repo.list).toHaveBeenCalled();
		});
	});
});
