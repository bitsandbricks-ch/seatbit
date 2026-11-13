import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: { url: process.env.DATABASE_PATH ?? "./data/lan.db" },
  // Timestamp names (20261113153000_name.sql) instead of 0036_name.sql, so two
  // branches never claim the same number. Applied state is tracked by the
  // journal's `when`, not the file name, so older numbered files keep working.
  migrations: { prefix: "timestamp" },
});
