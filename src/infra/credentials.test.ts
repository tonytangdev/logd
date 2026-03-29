import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CredentialStore } from "./credentials.js";

describe("CredentialStore", () => {
  let tempDir: string;
  let store: CredentialStore;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "logd-creds-"));
    store = new CredentialStore(join(tempDir, "credentials.json"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns null for unknown server", () => {
    expect(store.getToken("https://unknown.com")).toBeNull();
  });

  it("saves and retrieves a token", () => {
    store.setToken("https://api.example.com", "my-token");
    expect(store.getToken("https://api.example.com")).toBe("my-token");
  });

  it("persists across instances", () => {
    store.setToken("https://api.example.com", "my-token");
    const store2 = new CredentialStore(join(tempDir, "credentials.json"));
    expect(store2.getToken("https://api.example.com")).toBe("my-token");
  });

  it("removes a token", () => {
    store.setToken("https://api.example.com", "my-token");
    store.removeToken("https://api.example.com");
    expect(store.getToken("https://api.example.com")).toBeNull();
  });

  it("lists all servers", () => {
    store.setToken("https://a.com", "t1");
    store.setToken("https://b.com", "t2");
    expect(store.listServers()).toEqual(["https://a.com", "https://b.com"]);
  });

  it("returns empty list when no servers", () => {
    expect(store.listServers()).toEqual([]);
  });

  it("creates file with 0600 permissions on unix", () => {
    store.setToken("https://api.example.com", "token");
    const stats = statSync(join(tempDir, "credentials.json"));
    expect(stats.mode & 0o777).toBe(0o600);
  });

  it("falls back to LOGD_TOKEN env var when no stored token", () => {
    const original = process.env.LOGD_TOKEN;
    process.env.LOGD_TOKEN = "env-token";
    try {
      expect(store.getToken("https://any-server.com")).toBe("env-token");
    } finally {
      if (original !== undefined) {
        process.env.LOGD_TOKEN = original;
      } else {
        delete process.env.LOGD_TOKEN;
      }
    }
  });
});
