import { existsSync } from "node:fs"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import pg from "pg"

const { Client } = pg
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const outputFile = process.argv[2]

if (!outputFile) {
  throw new Error(
    "A destination for the Custom Shell database snapshot is required."
  )
}

await loadEnv(path.join(root, ".env.local"))
await loadEnv(path.join(root, ".env"))

const databaseUrl =
  process.env.CUSTOM_SHELL_DATABASE_URL ||
  `postgresql://postgres:localdev@localhost:${process.env.CUSTOM_SHELL_POSTGRES_PORT || "54320"}/custom_shell`
const client = new Client({
  connectionString: databaseUrl,
  connectionTimeoutMillis: 5_000,
})

try {
  await client.connect()
  await client.query("begin isolation level repeatable read read only")
  try {
    const tableResult = await client.query(
      `select table_name
         from information_schema.tables
        where table_schema = 'public'
          and table_type = 'BASE TABLE'
        order by table_name`
    )
    const tables = []

    for (const { table_name: tableName } of tableResult.rows) {
      const result = await client.query(
        `select * from ${quoteIdentifier(tableName)}`
      )
      tables.push({ name: tableName, rows: result.rows })
    }

    await writeFile(outputFile, JSON.stringify({ version: 1, tables }), {
      mode: 0o600,
    })
    await client.query("commit")
  } catch (error) {
    await client.query("rollback").catch(() => {})
    throw error
  }
} finally {
  await client.end().catch(() => {})
}

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`
}

async function loadEnv(file) {
  if (!existsSync(file)) return

  const contents = await readFile(file, "utf8")
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue

    const separator = line.indexOf("=")
    if (separator === -1) continue

    const key = line.slice(0, separator).trim()
    const value = line
      .slice(separator + 1)
      .trim()
      .replace(/^["']|["']$/g, "")
    if (key && process.env[key] === undefined) {
      process.env[key] = value
    }
  }
}
