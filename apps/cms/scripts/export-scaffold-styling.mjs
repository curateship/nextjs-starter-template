import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import pg from "pg"

const { Client } = pg
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

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
  const result = await client.query(
    `select workspaces.settings->'styling' as styling
       from workspaces
       join users on users.id = workspaces.user_id
      where users.role = 'admin'
        and users.status = 'active'
        and workspaces.is_default = true
        and jsonb_typeof(workspaces.settings->'styling') = 'object'
      order by (
        select max(sessions.last_seen_at)
          from sessions
         where sessions.user_id = users.id
           and sessions.viewing_as_user_id is null
           and sessions.expires_at > now()
      ) desc nulls last,
      workspaces.updated_at desc
      limit 1`
  )

  const styling = result.rows[0]?.styling
  if (!styling || typeof styling !== "object" || Array.isArray(styling)) {
    throw new Error("Custom Shell does not have saved styling to copy.")
  }

  process.stdout.write(JSON.stringify(styling))
} finally {
  await client.end().catch(() => {})
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
