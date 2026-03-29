import { randomUUID } from "node:crypto";
import type { User } from "@logd/shared";

export function buildUser(email: string, name: string): User {
	return {
		id: randomUUID(),
		email,
		name,
		createdAt: new Date().toISOString(),
	};
}
