import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RemoteClient } from "./remote.client.js";

describe("RemoteClient", () => {
  let client: RemoteClient;

  beforeEach(() => {
    client = new RemoteClient("https://api.example.com", "test-token", "acme");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends auth and team headers", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ id: "d1", project: "proj", title: "T", context: null, alternatives: null, tags: null, status: "active", links: null, createdAt: "2026-01-01", updatedAt: "2026-01-01" }), { status: 200 }),
    );
    await client.createDecision("proj", { project: "proj", title: "T" });
    expect(fetch).toHaveBeenCalledWith(
      "https://api.example.com/decisions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-token",
          "X-Team": "acme",
        }),
      }),
    );
  });

  it("throws on 401", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("", { status: 401 }));
    await expect(client.validateToken()).rejects.toThrow("token expired");
  });

  it("throws on 403", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("", { status: 403 }));
    await expect(client.validateToken()).rejects.toThrow("not a member of this team");
  });

  it("throws connection error when fetch fails", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(client.validateToken()).rejects.toThrow("Cannot reach server");
  });

  it("searchDecisions sends query string not embedding", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
    await client.searchDecisions("proj", "why postgres?", 0.5, 5);
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string);
    expect(body.query).toBe("why postgres?");
    expect(body).not.toHaveProperty("embedding");
  });

  it("validateToken returns true on 200", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("OK", { status: 200 }));
    expect(await client.validateToken()).toBe(true);
  });
});
