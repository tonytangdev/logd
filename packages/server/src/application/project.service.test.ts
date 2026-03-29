import { beforeEach, describe, expect, it } from "vitest";
import type { ProjectRepository } from "../ports/project.repository.js";
import { ProjectService } from "./project.service.js";

function mockProjectRepo(): ProjectRepository & { names: Set<string> } {
	const names = new Set<string>();
	return {
		names,
		async create(name: string, _description: string | null, _teamId: string) {
			names.add(name.toLowerCase());
		},
		async findByName(name: string) {
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

	it("creates a project", async () => {
		await service.create("my-proj", "desc", "t-1");
		expect(repo.names.has("my-proj")).toBe(true);
	});

	it("throws 409 on duplicate", async () => {
		await service.create("dup", null, "t-1");
		await expect(service.create("dup", null, "t-1")).rejects.toThrow(
			"already exists",
		);
	});
});
