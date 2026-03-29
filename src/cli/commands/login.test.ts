import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CredentialStore } from "../../infra/credentials.js";
import { registerLoginCommand } from "./login.js";

vi.mock("../../infra/credentials.js");

describe("login commands", () => {
	let program: Command;
	let credentialStore: CredentialStore;
	let output: string[];

	beforeEach(() => {
		output = [];
		vi.spyOn(console, "log").mockImplementation((...args) =>
			output.push(args.join(" ")),
		);
		vi.spyOn(console, "error").mockImplementation((...args) =>
			output.push(args.join(" ")),
		);
		vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

		credentialStore = new CredentialStore("/tmp/fake");
		credentialStore.setToken = vi.fn();
		credentialStore.removeToken = vi.fn();
		credentialStore.listServers = vi
			.fn()
			.mockReturnValue(["https://api.example.com"]);

		program = new Command();
		program.exitOverride();
		registerLoginCommand(program, credentialStore);
	});

	it("login stores token", () => {
		program.parse(["login", "https://api.example.com", "--token", "my-token"], {
			from: "user",
		});
		expect(credentialStore.setToken).toHaveBeenCalledWith(
			"https://api.example.com",
			"my-token",
		);
	});

	it("logout removes token", () => {
		program.parse(["logout", "https://api.example.com"], { from: "user" });
		expect(credentialStore.removeToken).toHaveBeenCalledWith(
			"https://api.example.com",
		);
	});

	it("server list shows servers", () => {
		program.parse(["server", "list"], { from: "user" });
		expect(
			output.some((line) => line.includes("https://api.example.com")),
		).toBe(true);
	});

	it("server list shows message when empty", () => {
		credentialStore.listServers = vi.fn().mockReturnValue([]);
		program.parse(["server", "list"], { from: "user" });
		expect(output.some((line) => line.includes("No servers configured"))).toBe(
			true,
		);
	});
});
