import { defineConfig } from "drizzle-kit"

const url =
  process.env.AI_AGENTS_DATABASE_URL ||
  process.env.DATABASE_URL ||
  "postgresql://postgres:localdev@localhost:54323/ai_agents"

export default defineConfig({
  schema: "./src/server/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: url.replace(/^postgresql\+psycopg:\/\//, "postgresql://"),
  },
})
