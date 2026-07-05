import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

/**
 * Loads .env.local the same way scripts/setup-database.mjs does — the worker
 * runs outside Vite/Nitro, so nothing else populates process.env for it.
 */
export function loadWorkerEnv() {
  const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../.."
  )
  const file = path.join(root, ".env.local")
  if (!existsSync(file)) return

  const contents = readFileSync(file, "utf8")
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
