import { defineConfig } from "drizzle-kit"

const url =
  process.env.CORE_DATABASE_URL ||
  process.env.DATABASE_URL ||
  "postgresql://postgres:localdev@localhost:54321/core"

export default defineConfig({
  schema: "./src/server/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: url.replace(/^postgresql\+psycopg:\/\//, "postgresql://"),
  },
})
