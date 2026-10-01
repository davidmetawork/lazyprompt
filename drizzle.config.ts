import { defineConfig } from "drizzle-kit";
import { loadDevEnv } from "./scripts/lib/env-files";

loadDevEnv();

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "postgres://localhost:5432/lazyprompt",
  },
});
