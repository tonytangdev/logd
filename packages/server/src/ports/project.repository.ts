export interface ProjectRepository {
	create(name: string, description: string | null, teamId: string): void;
	findByName(name: string): boolean;
}
