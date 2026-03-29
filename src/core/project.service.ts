import { randomUUID } from "node:crypto";
import type { IProjectRepo, Project } from "./types.js";

export class ProjectService {
	private repo: IProjectRepo;

	constructor(repo: IProjectRepo) {
		this.repo = repo;
	}

	create(name: string, description?: string): Project {
		const normalized = name.trim().toLowerCase();

		const existing = this.repo.findByName(normalized);
		if (existing) {
			throw new Error(`Project '${normalized}' already exists`);
		}

		const project: Project = {
			id: randomUUID(),
			name: normalized,
			description: description ?? null,
			createdAt: new Date().toISOString(),
			server: null,
			team: null,
		};

		this.repo.create(project);
		return project;
	}

	list(): Project[] {
		return this.repo.list();
	}
}
