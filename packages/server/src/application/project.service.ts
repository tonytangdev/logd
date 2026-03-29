import type { ProjectRepository } from "../ports/project.repository.js";

export class ProjectService {
	constructor(private repo: ProjectRepository) {}

	create(name: string, description: string | null, teamId: string): void {
		if (this.repo.findByName(name)) {
			throw new ConflictError(`Project '${name}' already exists`);
		}
		this.repo.create(name, description, teamId);
	}
}

export class ConflictError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ConflictError";
	}
}
