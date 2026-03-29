import { randomUUID } from "node:crypto";

export function buildProjectId(): string {
	return randomUUID();
}
