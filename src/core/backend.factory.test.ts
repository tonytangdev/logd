import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EmbeddingService } from "./embedding.service.js";
import type { IDecisionRepo, Project } from "./types.js";
import { BackendFactory } from "./backend.factory.js";
import { LocalDecisionBackend } from "../infra/local.decision.backend.js";
import { RemoteDecisionBackend } from "../infra/remote.decision.backend.js";
import { CredentialStore } from "../infra/credentials.js";

vi.mock("../infra/credentials.js");
vi.mock("../infra/remote.decision.backend.js");

const localProject: Project = {
  id: "p1", name: "local-proj", description: null,
  createdAt: "2026-01-01", server: null, team: null,
};

const remoteProject: Project = {
  id: "p2", name: "remote-proj", description: null,
  createdAt: "2026-01-01", server: "https://api.example.com", team: "acme",
};

describe("BackendFactory", () => {
  let decisionRepo: IDecisionRepo;
  let credentialStore: CredentialStore;
  let embeddingService: EmbeddingService;
  let factory: BackendFactory;

  beforeEach(() => {
    decisionRepo = {
      create: vi.fn(), findById: vi.fn(), update: vi.fn(),
      delete: vi.fn(), list: vi.fn(), searchByVector: vi.fn(),
    };
    credentialStore = new CredentialStore("/tmp/fake");
    credentialStore.getToken = vi.fn().mockReturnValue("test-token");
    embeddingService = { embedDecision: vi.fn(), embedQuery: vi.fn() } as unknown as EmbeddingService;
    factory = new BackendFactory(decisionRepo, credentialStore, embeddingService);
  });

  it("returns local backend for local project", () => {
    const result = factory.forProject(localProject);
    expect(result.decisions).toBeInstanceOf(LocalDecisionBackend);
    expect(result.embeddings).toBe(embeddingService);
  });

  it("returns remote backend for remote project", () => {
    const result = factory.forProject(remoteProject);
    expect(result.decisions).toBeInstanceOf(RemoteDecisionBackend);
    expect(result.embeddings).toBeNull();
  });

  it("throws when no token for remote project", () => {
    credentialStore.getToken = vi.fn().mockReturnValue(null);
    expect(() => factory.forProject(remoteProject)).toThrow("logd login");
  });

  it("localBackend returns local backend without project", () => {
    const result = factory.localBackend();
    expect(result.decisions).toBeInstanceOf(LocalDecisionBackend);
    expect(result.embeddings).toBe(embeddingService);
  });
});
