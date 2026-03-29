import { randomUUID } from "node:crypto";
import type { IProjectRepo, Project } from "./types.js";

export class ProjectService {
	private repo: IProjectRepo;

	constructor(repo: IProjectRepo) {
		this.repo = repo;
	}

	create(name: string, description?: string, server?: string, team?: string): Project {
		const normalized = name.trim().toLowerCase();

		if (server && !team) {
			throw new Error("--team is required when --server is specified");
		}
		if (team && !server) {
			throw new Error("--server is required when --team is specified");
		}

		const existing = this.repo.findByName(normalized);
		if (existing) {
			throw new Error(`Project '${normalized}' already exists`);
		}

		const project: Project = {
			id: randomUUID(),
			name: normalized,
			description: description ?? null,
			createdAt: new Date().toISOString(),
			server: server ?? null,
			team: team ?? null,
		};

		this.repo.create(project);
		return project;
	}

	list(): Project[] {
		return this.repo.list();
	}
}
