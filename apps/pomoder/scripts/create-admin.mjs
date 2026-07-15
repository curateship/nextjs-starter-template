import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { hash } from "argon2"
import pg from "pg"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
await loadEnv(path.join(root, ".env.local"))

const email = process.env.POMODER_ADMIN_EMAIL?.trim().toLowerCase()
const password = process.env.POMODER_ADMIN_PASSWORD
const name = process.env.POMODER_ADMIN_NAME?.trim() || "Admin"
if (!email || !password || password.length < 8) throw new Error("Set POMODER_ADMIN_EMAIL and an 8+ character POMODER_ADMIN_PASSWORD for this one-time command.")

const url = process.env.POMODER_DATABASE_URL || `postgresql://postgres:localdev@localhost:${process.env.POMODER_POSTGRES_PORT || "54326"}/pomoder`
const client = new pg.Client({ connectionString: url })
await client.connect()
try {
  await client.query(`insert into users (email, name, role, password_hash, email_verified_at, created_at, updated_at)
    values ($1, $2, 'admin', $3, now(), now(), now())
    on conflict (email) do update set role = 'admin', name = excluded.name, password_hash = excluded.password_hash, email_verified_at = now(), updated_at = now()`, [email, name, await hash(password, { type: 2, memoryCost: 65_536, timeCost: 3, parallelism: 1 })])
  console.log(`Admin access enabled for ${email}. Remove POMODER_ADMIN_PASSWORD from the environment now.`)
} finally { await client.end() }

async function loadEnv(file) {
  try {
    const contents = await readFile(file, "utf8")
    for (const rawLine of contents.split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line || line.startsWith("#")) continue
      const separator = line.indexOf("=")
      if (separator === -1) continue
      const key = line.slice(0, separator).trim()
      const value = line.slice(separator + 1).trim().replace(/^["']|["']$/g, "")
      if (key && process.env[key] === undefined) process.env[key] = value
    }
  } catch (error) { if (error?.code !== "ENOENT") throw error }
}
