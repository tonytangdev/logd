import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

interface CredentialsFile {
	servers: Record<string, { token: string }>;
}

export class CredentialStore {
	constructor(private filePath: string) {}

	getToken(serverUrl: string): string | null {
		const data = this.read();
		const entry = data.servers[serverUrl];
		if (entry) return entry.token;
		return process.env.LOGD_TOKEN ?? null;
	}

	setToken(serverUrl: string, token: string): void {
		const data = this.read();
		data.servers[serverUrl] = { token };
		this.write(data);
	}

	removeToken(serverUrl: string): void {
		const data = this.read();
		delete data.servers[serverUrl];
		this.write(data);
	}

	listServers(): string[] {
		const data = this.read();
		return Object.keys(data.servers);
	}

	private read(): CredentialsFile {
		if (!existsSync(this.filePath)) {
			return { servers: {} };
		}
		return JSON.parse(readFileSync(this.filePath, "utf-8")) as CredentialsFile;
	}

	private write(data: CredentialsFile): void {
		mkdirSync(dirname(this.filePath), { recursive: true });
		writeFileSync(this.filePath, JSON.stringify(data, null, 2), {
			mode: 0o600,
		});
	}
}
