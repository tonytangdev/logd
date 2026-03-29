import type {
  CreateDecisionInput,
  Decision,
  DecisionStatus,
  SearchResult,
  UpdateDecisionInput,
} from "../core/types.js";

export class RemoteClient {
  constructor(
    private baseUrl: string,
    private token: string,
    private team: string,
  ) {}

  async createDecision(project: string, input: CreateDecisionInput): Promise<Decision> {
    return this.request<Decision>("POST", "/decisions", { ...input, project });
  }

  async getDecision(id: string): Promise<Decision | null> {
    try {
      return await this.request<Decision>("GET", `/decisions/${id}`);
    } catch (e) {
      if ((e as Error).message.includes("404")) return null;
      throw e;
    }
  }

  async updateDecision(id: string, input: UpdateDecisionInput): Promise<void> {
    await this.request<void>("PATCH", `/decisions/${id}`, input);
  }

  async deleteDecision(id: string): Promise<void> {
    await this.request<void>("DELETE", `/decisions/${id}`);
  }

  async listDecisions(options?: {
    project?: string;
    status?: DecisionStatus;
    limit?: number;
  }): Promise<Decision[]> {
    const params = new URLSearchParams();
    if (options?.project) params.set("project", options.project);
    if (options?.status) params.set("status", options.status);
    if (options?.limit) params.set("limit", String(options.limit));
    const qs = params.toString();
    return this.request<Decision[]>("GET", `/decisions${qs ? `?${qs}` : ""}`);
  }

  async searchDecisions(
    project: string,
    query: string,
    threshold: number,
    limit: number,
  ): Promise<SearchResult[]> {
    return this.request<SearchResult[]>("POST", "/decisions/search", {
      project,
      query,
      threshold,
      limit,
    });
  }

  async createProject(name: string, description?: string): Promise<void> {
    await this.request<void>("POST", "/projects", { name, description });
  }

  async validateToken(): Promise<boolean> {
    await this.request<unknown>("GET", "/auth/validate");
    return true;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.token}`,
          "X-Team": this.team,
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new Error(`Cannot reach server at ${this.baseUrl}. Check your connection.`);
    }

    if (response.status === 401) {
      throw new Error("Authentication failed: token expired or invalid. Run `logd login` to re-authenticate.");
    }
    if (response.status === 403) {
      throw new Error("Access denied: not a member of this team.");
    }
    if (!response.ok) {
      throw new Error(`Server error: ${response.status} ${response.statusText}`);
    }

    const text = await response.text();
    if (!text) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      return undefined as T;
    }
  }
}
