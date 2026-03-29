import { randomUUID } from "node:crypto";
import type { CreateDecisionInput, Decision, DecisionStatus } from "@logd/shared";

export function buildDecision(input: CreateDecisionInput): Decision {
	const now = new Date().toISOString();
	return {
		id: randomUUID(),
		project: input.project,
		title: input.title,
		context: input.context ?? null,
		alternatives: input.alternatives ?? null,
		tags: input.tags ?? null,
		status: input.status ?? "active",
		links: input.links ?? null,
		createdAt: now,
		updatedAt: now,
	};
}

export function buildDocumentTemplate(decision: {
	title: string;
	context?: string | null;
	alternatives?: string[] | null;
	tags?: string[] | null;
	status?: DecisionStatus | string;
}): string {
	const lines: string[] = [`Decision: ${decision.title}`];
	if (decision.context) lines.push(`Context: ${decision.context}`);
	if (decision.alternatives?.length)
		lines.push(`Alternatives: ${decision.alternatives.join(", ")}`);
	if (decision.tags?.length)
		lines.push(`Tags: ${decision.tags.join(", ")}`);
	if (decision.status) lines.push(`Status: ${decision.status}`);
	return lines.join("\n");
}

export function buildQueryTemplate(query: string): string {
	return `Instruct: Given a question about past decisions, retrieve relevant decision records\nQuery: ${query}`;
}
