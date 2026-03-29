import type { CredentialStore } from "../infra/credentials.js";
import { LocalDecisionBackend } from "../infra/local.decision.backend.js";
import { RemoteClient } from "../infra/remote.client.js";
import { RemoteDecisionBackend } from "../infra/remote.decision.backend.js";
import type { EmbeddingService } from "./embedding.service.js";
import type {
	DecisionBackend,
	IDecisionRepo,
	LocalDecisionSearch,
	Project,
	RemoteDecisionSearch,
} from "./types.js";

export interface BackendResult {
	decisions: DecisionBackend;
	search: LocalDecisionSearch | RemoteDecisionSearch;
	embeddings: EmbeddingService | null;
}

export class BackendFactory {
	constructor(
		private localDecisionRepo: IDecisionRepo,
		private credentialStore: CredentialStore,
		private embeddingService: EmbeddingService,
	) {}

	forProject(project: Project): BackendResult {
		if (!project.server) {
			const backend = new LocalDecisionBackend(this.localDecisionRepo);
			return {
				decisions: backend,
				search: backend,
				embeddings: this.embeddingService,
			};
		}

		const token = this.credentialStore.getToken(project.server);
		if (!token) {
			throw new Error(
				`No token for server ${project.server}. Run: logd login ${project.server} --token <token>`,
			);
		}

		const client = new RemoteClient(project.server, token, project.team!);
		const backend = new RemoteDecisionBackend(client);
		return { decisions: backend, search: backend, embeddings: null };
	}

	localBackend(): {
		decisions: DecisionBackend;
		search: LocalDecisionSearch;
		embeddings: EmbeddingService;
	} {
		const backend = new LocalDecisionBackend(this.localDecisionRepo);
		return {
			decisions: backend,
			search: backend,
			embeddings: this.embeddingService,
		};
	}
}
