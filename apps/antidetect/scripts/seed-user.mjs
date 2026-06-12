// Dev-only: create (or reset the password of) a login user, since the app has no
// public registration. Usage:
//   node scripts/seed-user.mjs [email] [password]
// Defaults: admin@antidetect.local / antidetect-dev
import { randomUUID } from "node:crypto"

import { hash } from "argon2"
import { Pool } from "pg"

const url =
  process.env.ANTIDETECT_DATABASE_URL ||
  "postgresql://postgres:localdev@localhost:54321/postgres"
const email = (process.argv[2] || "admin@antidetect.local").toLowerCase()
const password = process.argv[3] || "antidetect-dev"

const pool = new Pool({ connectionString: url })
const passwordHash = await hash(password)
const nowTs = new Date()

await pool.query(
  `INSERT INTO custom_shell_users (id, email, name, role, password_hash, created_at, updated_at)
   VALUES ($1, $2, $3, $4, $5, $6, $6)
   ON CONFLICT (email)
   DO UPDATE SET password_hash = EXCLUDED.password_hash, updated_at = EXCLUDED.updated_at`,
  [randomUUID(), email, "Admin", "admin", passwordHash, nowTs]
)

console.log(`Seeded user: ${email}  (password: ${password})`)
await pool.end()
