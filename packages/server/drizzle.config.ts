import { defineConfig } from "drizzle-kit";

export default defineConfig({
	dialect: "postgresql",
	schema: "./src/adapters/persistence/schema.ts",
	out: "./drizzle",
});
