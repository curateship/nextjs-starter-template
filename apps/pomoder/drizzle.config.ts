import { defineConfig } from "drizzle-kit"

const url =
  process.env.POMODER_DATABASE_URL ||
  `postgresql://postgres:localdev@localhost:${process.env.POMODER_POSTGRES_PORT || "54326"}/pomoder`

export default defineConfig({
  schema: "./src/server/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url,
  },
})
