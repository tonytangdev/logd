import {
	pgTable,
	primaryKey,
	text,
	uniqueIndex,
	vector,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
	id: text("id").primaryKey(),
	email: text("email").notNull().unique(),
	name: text("name").notNull(),
	createdAt: text("created_at")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
});

export const teams = pgTable("teams", {
	id: text("id").primaryKey(),
	name: text("name").notNull().unique(),
	createdAt: text("created_at")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
});

export const teamMembers = pgTable(
	"team_members",
	{
		userId: text("user_id")
			.notNull()
			.references(() => users.id),
		teamId: text("team_id")
			.notNull()
			.references(() => teams.id),
		role: text("role").notNull(),
		createdAt: text("created_at")
			.notNull()
			.$defaultFn(() => new Date().toISOString()),
	},
	(table) => [primaryKey({ columns: [table.userId, table.teamId] })],
);

export const tokens = pgTable("tokens", {
	id: text("id").primaryKey(),
	userId: text("user_id")
		.notNull()
		.references(() => users.id),
	tokenHash: text("token_hash").notNull().unique(),
	name: text("name").notNull(),
	createdAt: text("created_at")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
	lastUsedAt: text("last_used_at"),
});

export const projects = pgTable(
	"projects",
	{
		id: text("id").primaryKey(),
		name: text("name").notNull().unique(),
		description: text("description"),
		teamId: text("team_id").references(() => teams.id),
		createdAt: text("created_at")
			.notNull()
			.$defaultFn(() => new Date().toISOString()),
	},
	(table) => [
		uniqueIndex("idx_projects_name_team").on(table.name, table.teamId),
	],
);

export const decisions = pgTable("decisions", {
	id: text("id").primaryKey(),
	project: text("project")
		.notNull()
		.references(() => projects.name),
	title: text("title").notNull(),
	context: text("context"),
	alternatives: text("alternatives"),
	tags: text("tags"),
	status: text("status").notNull().default("active"),
	links: text("links"),
	createdAt: text("created_at")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
	updatedAt: text("updated_at")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
});

export const decisionsVec = pgTable("decisions_vec", {
	id: text("id")
		.primaryKey()
		.references(() => decisions.id),
	embedding: vector("embedding", { dimensions: 1024 }),
});
