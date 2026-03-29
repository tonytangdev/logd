import type {
  CreateDecisionInput,
  Decision,
  DecisionBackend,
  DecisionStatus,
  RemoteDecisionSearch,
  SearchResult,
  UpdateDecisionInput,
} from "../core/types.js";
import type { RemoteClient } from "./remote.client.js";

export class RemoteDecisionBackend implements DecisionBackend, RemoteDecisionSearch {
  constructor(private client: RemoteClient) {}

  async create(decision: Decision, _embedding: number[]): Promise<void> {
    const input: CreateDecisionInput = {
      project: decision.project,
      title: decision.title,
      context: decision.context ?? undefined,
      alternatives: decision.alternatives ?? undefined,
      tags: decision.tags ?? undefined,
      status: decision.status,
      links: decision.links ?? undefined,
    };
    await this.client.createDecision(decision.project, input);
  }

  async findById(id: string): Promise<Decision | null> {
    return this.client.getDecision(id);
  }

  async update(id: string, input: UpdateDecisionInput, _embedding?: number[]): Promise<void> {
    await this.client.updateDecision(id, input);
  }

  async delete(id: string): Promise<void> {
    await this.client.deleteDecision(id);
  }

  async list(options?: { project?: string; status?: DecisionStatus; limit?: number }): Promise<Decision[]> {
    return this.client.listDecisions(options);
  }

  async searchByQuery(project: string, query: string, threshold: number, limit: number): Promise<SearchResult[]> {
    return this.client.searchDecisions(project, query, threshold, limit);
  }
}
