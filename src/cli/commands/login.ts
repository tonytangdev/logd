import type { Command } from "commander";
import type { CredentialStore } from "../../infra/credentials.js";

export function registerLoginCommand(program: Command, credentialStore: CredentialStore) {
  program
    .command("login <url>")
    .description("Authenticate with a logd server")
    .requiredOption("--token <token>", "API token")
    .action((url: string, opts: { token: string }) => {
      try {
        credentialStore.setToken(url, opts.token);
        console.log(`Logged in to ${url}`);
      } catch (e) {
        console.error(`Error: ${(e as Error).message}`);
        process.exit(1);
      }
    });

  program
    .command("logout <url>")
    .description("Remove credentials for a logd server")
    .action((url: string) => {
      try {
        credentialStore.removeToken(url);
        console.log(`Logged out from ${url}`);
      } catch (e) {
        console.error(`Error: ${(e as Error).message}`);
        process.exit(1);
      }
    });

  const server = program.command("server").description("Manage server connections");

  server
    .command("list")
    .description("List authenticated servers")
    .action(() => {
      const servers = credentialStore.listServers();
      if (servers.length === 0) {
        console.log("No servers configured. Run: logd login <url> --token <token>");
        return;
      }
      for (const s of servers) {
        console.log(s);
      }
    });
}
