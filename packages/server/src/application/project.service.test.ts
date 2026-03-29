import { describe, it, expect, beforeEach } from "vitest";
import type { ProjectRepository } from "../ports/project.repository.js";
import { ProjectService } from "./project.service.js";

function mockProjectRepo(): ProjectRepository & { names: Set<string> } {
	const names = new Set<string>();
	return {
		names,
		create(name: string, description: string | null) {
			names.add(name.toLowerCase());
		},
		findByName(name: string) {
			return names.has(name.toLowerCase());
		},
	};
}

describe("ProjectService", () => {
	let service: ProjectService;
	let repo: ReturnType<typeof mockProjectRepo>;

	beforeEach(() => {
		repo = mockProjectRepo();
		service = new ProjectService(repo);
	});

	it("creates a project", () => {
		service.create("my-proj", "desc");
		expect(repo.names.has("my-proj")).toBe(true);
	});

	it("throws 409 on duplicate", () => {
		service.create("dup", null);
		expect(() => service.create("dup", null)).toThrow("already exists");
	});
});
