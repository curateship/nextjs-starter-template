/**
 * Put Tyler's AI provider keys into a live app's database, so Settings → AI
 * on the live site works without pasting them in by hand.
 *
 *   node .agents/skills/deploy-app/scripts/copy-ai-keys.mjs pomodoro
 *   node .agents/skills/deploy-app/scripts/copy-ai-keys.mjs pomodoro --dry-run
 *
 * `deploy.mjs` runs this by itself after every deploy. Run it by hand after
 * changing a key in `secrets.env` without a deploy.
 *
 * The keys come from `~/.config/deploy-app/secrets.env` (`ANTHROPIC_API_KEY`,
 * `OPENAI_API_KEY`, `GEMINI_API_KEY`, `ELEVENLABS_API_KEY`). Each one is
 * encrypted with the app's `CUSTOM_SHELL_SECRET_ENCRYPTION_KEY` from
 * `apps/<app>/.env.live`, exactly as the app's own `encryptSecret` does
 * (`src/server/auth/encryption.ts`), and saved in `ai_provider_keys`, the
 * same row Settings → AI writes.
 *
 * - A provider with no key in `secrets.env` is left as it is on live.
 * - A live key that already matches is not rewritten.
 * - A live key that differs, or that live can no longer unscramble, is
 *   replaced, because `secrets.env` wins.
 *
 * Only the last four characters of any key are ever printed.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { parseEnvText, SECRETS_FILE } from "./deploy.mjs"
import { readSecrets, repoRoot, withLiveDatabase } from "./live-db.mjs"

/** The providers in `AI_PROVIDERS` (`src/lib/ai/ai-models.ts`), each with its name in `secrets.env`. */
export const PROVIDER_SECRETS = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  gemini: "GEMINI_API_KEY",
  elevenlabs: "ELEVENLABS_API_KEY",
}

/** `encryptSecret` from the app: AES-256-GCM on the SHA-256 of the secret, stored as iv.tag.text in base64. */
export function encryptSecret(plaintext, secret) {
  const key = createHash("sha256").update(secret).digest()
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const text = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  return [iv, cipher.getAuthTag(), text].map((part) => part.toString("base64")).join(".")
}

/** `decryptSecret` from the app, but answers null where the app throws SECRET_UNREADABLE. */
export function decryptSecret(stored, secret) {
  const parts = String(stored).split(".")
  if (parts.length !== 3) return null
  try {
    const key = createHash("sha256").update(secret).digest()
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(parts[0], "base64"))
    decipher.setAuthTag(Buffer.from(parts[1], "base64"))
    return Buffer.concat([decipher.update(Buffer.from(parts[2], "base64")), decipher.final()]).toString("utf8")
  } catch {
    return null
  }
}

/** The same mask Settings → AI shows, enough to recognise a key. */
export function maskKey(key) {
  return `••••${key.slice(-4)}`
}

/** Each provider with a key in `secrets.env`, trimmed. */
export function wantedKeys(secrets) {
  const wanted = {}
  for (const [provider, name] of Object.entries(PROVIDER_SECRETS)) {
    const key = secrets[name]?.trim()
    if (key) wanted[provider] = key
  }
  return wanted
}

/**
 * What to do per provider, given the wanted keys and the live rows already
 * unscrambled (`undefined` for no row, `null` for a row live cannot read).
 */
export function comparePlan(wanted, live) {
  return Object.entries(wanted).map(([provider, key]) => {
    const now = live[provider]
    if (now === undefined) return { provider, key, action: "add" }
    if (now === null) return { provider, key, action: "replace", was: "unreadable" }
    if (now === key) return { provider, key, action: "same" }
    return { provider, key, action: "replace", was: maskKey(now) }
  })
}

export function describePlan(plan) {
  return plan
    .map(({ provider, key, action, was }) =>
      action === "same" ? `${provider} ${maskKey(key)} already there` : action === "add" ? `${provider} ${maskKey(key)} added` : `${provider} ${maskKey(key)} replaces ${was}`
    )
    .join(", ")
}

/** Copies the keys to live. Returns the providers it wrote, for the deploy report. */
export async function copyAiKeys(appName, { dryRun = false } = {}) {
  const wanted = wantedKeys(await readSecrets())
  if (!Object.keys(wanted).length) {
    console.log(`No AI keys in ${SECRETS_FILE}, so none were copied. Names it reads: ${Object.values(PROVIDER_SECRETS).join(", ")}.`)
    return { written: [] }
  }
  const live = parseEnvText(await readFile(path.join(repoRoot, "apps", appName, ".env.live"), "utf8"))
  const secret = live.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY
  if (!secret) throw new Error(`apps/${appName}/.env.live has no CUSTOM_SHELL_SECRET_ENCRYPTION_KEY, so the keys cannot be encrypted the way live reads them.`)

  return withLiveDatabase(appName, async (client) => {
    const rows = (await client.query("select provider, api_key from ai_provider_keys")).rows
    const plan = comparePlan(wanted, Object.fromEntries(rows.map((row) => [row.provider, decryptSecret(row.api_key, secret)])))
    console.log(`AI keys: ${describePlan(plan)}.`)
    const writes = plan.filter((one) => one.action !== "same")
    if (dryRun || !writes.length) return { written: [] }

    await client.query("begin")
    try {
      for (const { provider, key } of writes) {
        await client.query(
          `insert into ai_provider_keys (provider, api_key, created_at, updated_at) values ($1, $2, now(), now())
           on conflict (provider) do update set api_key = excluded.api_key, updated_at = now()`,
          [provider, encryptSecret(key, secret)]
        )
      }
      await client.query("commit")
    } catch (error) {
      await client.query("rollback").catch(() => {})
      throw error
    }
    console.log(`Copied to live: ${writes.map((one) => one.provider).join(", ")}.`)
    return { written: writes.map((one) => one.provider) }
  })
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const appName = args.find((one) => !one.startsWith("--"))
  ;(appName ? copyAiKeys(appName, { dryRun: args.includes("--dry-run") }) : Promise.reject(new Error("Name the app, for example: copy-ai-keys.mjs pomodoro")))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error)
      process.exit(1)
    })
}
