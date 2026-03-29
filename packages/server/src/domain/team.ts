import { randomUUID } from "node:crypto";
import type { Team } from "@logd/shared";

export function buildTeam(name: string): Team {
	return {
		id: randomUUID(),
		name,
		createdAt: new Date().toISOString(),
	};
}
