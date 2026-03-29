import { describe, expect, it } from "vitest";
import type {
	DecisionBackend,
	LocalDecisionSearch,
	RemoteDecisionSearch,
} from "./types.js";
import {
	type CreateDecisionInput,
	DECISION_STATUSES,
	type Decision,
	type DecisionStatus,
	type Project,
	type SearchInput,
	type SearchResult,
	type UpdateDecisionInput,
} from "./types.js";

describe("DECISION_STATUSES", () => {
	it("contains exactly active, superseded, deprecated", () => {
		expect(DECISION_STATUSES).toEqual(["active", "superseded", "deprecated"]);
	});

	it("is readonly", () => {
		// @ts-expect-error — should not allow mutation
		DECISION_STATUSES.push("invalid");
	});
});

describe("type contracts", () => {
	it("Decision has all required fields", () => {
		const decision: Decision = {
			id: "uuid",
			project: "myproject",
			title: "Use Postgres",
			context: null,
			alternatives: null,
			tags: null,
			status: "active",
			links: null,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		};
		expect(decision.id).toBe("uuid");
		expect(decision.status).toBe("active");
	});

	it("Decision optional fields accept arrays", () => {
		const decision: Decision = {
			id: "uuid",
			project: "myproject",
			title: "Use Postgres",
			context: "Need ACID",
			alternatives: ["MySQL", "MongoDB"],
			tags: ["backend", "db"],
			status: "superseded",
			links: ["https://example.com", "decision:other-uuid"],
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		};
		expect(decision.alternatives).toHaveLength(2);
		expect(decision.tags).toHaveLength(2);
		expect(decision.links).toHaveLength(2);
	});

	it("Project has all required fields", () => {
		const project: Project = {
			id: "uuid",
			name: "myproject",
			description: null,
			createdAt: "2026-01-01T00:00:00.000Z",
			server: null,
			team: null,
		};
		expect(project.name).toBe("myproject");
	});

	it("CreateDecisionInput requires project and title, rest optional", () => {
		const minimal: CreateDecisionInput = {
			project: "myproject",
			title: "Use Postgres",
		};
		expect(minimal.context).toBeUndefined();

		const full: CreateDecisionInput = {
			project: "myproject",
			title: "Use Postgres",
			context: "Need ACID",
			alternatives: ["MySQL"],
			tags: ["backend"],
			status: "active",
			links: ["https://example.com"],
		};
		expect(full.context).toBe("Need ACID");
	});

	it("UpdateDecisionInput has all fields optional", () => {
		const empty: UpdateDecisionInput = {};
		expect(Object.keys(empty)).toHaveLength(0);

		const partial: UpdateDecisionInput = { status: "deprecated" };
		expect(partial.status).toBe("deprecated");
	});

	it("SearchInput requires query, rest optional", () => {
		const minimal: SearchInput = { query: "why postgres?" };
		expect(minimal.limit).toBeUndefined();
		expect(minimal.threshold).toBeUndefined();
	});

	it("SearchResult pairs a decision with a score", () => {
		const result: SearchResult = {
			decision: {
				id: "uuid",
				project: "myproject",
				title: "Use Postgres",
				context: null,
				alternatives: null,
				tags: null,
				status: "active",
				links: null,
				createdAt: "2026-01-01T00:00:00.000Z",
				updatedAt: "2026-01-01T00:00:00.000Z",
			},
			score: 0.95,
		};
		expect(result.score).toBe(0.95);
	});

	it("DecisionStatus type only allows valid values", () => {
		const valid: DecisionStatus[] = ["active", "superseded", "deprecated"];
		expect(valid).toHaveLength(3);
		// @ts-expect-error — "invalid" is not a valid DecisionStatus
		const _invalid: DecisionStatus = "invalid";
	});
});

describe("backend interfaces", () => {
	it("DecisionBackend has required methods", () => {
		const _check = (backend: DecisionBackend) => {
			backend.create({} as Decision, []);
			backend.findById("id");
			backend.update("id", {});
			backend.delete("id");
			backend.list();
		};
		expect(_check).toBeDefined();
	});

	it("LocalDecisionSearch has searchByVector", () => {
		const _check = (search: LocalDecisionSearch) => {
			search.searchByVector([], 10);
		};
		expect(_check).toBeDefined();
	});

	it("RemoteDecisionSearch has searchByQuery", () => {
		const _check = (search: RemoteDecisionSearch) => {
			search.searchByQuery("proj", "query", 0.5, 10);
		};
		expect(_check).toBeDefined();
	});
});
