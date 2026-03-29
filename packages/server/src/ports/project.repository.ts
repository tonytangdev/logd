export interface ProjectRepository {
	create(name: string, description: string | null): void;
	findByName(name: string): boolean;
}
