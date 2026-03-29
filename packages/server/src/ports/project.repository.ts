export interface ProjectRepository {
	create(name: string, description: string | null, teamId: string): Promise<void>;
	findByName(name: string): Promise<boolean>;
}
