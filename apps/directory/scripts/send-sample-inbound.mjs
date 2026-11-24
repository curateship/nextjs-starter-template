#!/usr/bin/env node
/**
 * Posts one signed `email.received` event at a running dev server, so the real
 * inbound path can be walked before any MX record points at Resend.
 *
 * It is the only way to exercise the path end to end locally: the webhook
 * verifies a signature over the raw body, so a hand-rolled curl will always be
 * refused. This reads the workspace's saved webhook secret out of the database,
 * signs the body the way Svix does, and sends it.
 *
 * Run it through tsx, not plain node: it reads the saved secret by calling the
 * app's own `decryptSecret`, which is TypeScript. A second copy of that crypto
 * living in here is exactly the thing that would quietly drift.
 *
 *   npx tsx scripts/send-sample-inbound.mjs
 *   npx tsx scripts/send-sample-inbound.mjs --from "Jane <jane@buyer.com>" --subject "Re: Kitchen"
 *
 * The body itself is never fetched: Resend has no record of a made-up email id,
 * so the message lands with no words in it and the conversation says so. That
 * is the right answer and worth seeing once.
 */
import { createHmac, randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

import pg from "pg"

const { Client } = pg
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

function readArg(name, fallback) {
  const at = process.argv.indexOf(`--${name}`)
  return at >= 0 && process.argv[at + 1] ? process.argv[at + 1] : fallback
}

/** `.env.local` into `process.env`, the same way setup-database.mjs does. */
async function loadEnv(file) {
  let contents
  try {
    contents = await readFile(file, "utf8")
  } catch {
    return
  }
  for (const line of contents.split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!match) continue
    const value = match[2].replace(/^["']|["']$/g, "")
    if (!process.env[match[1]]) process.env[match[1]] = value
  }
}

await loadEnv(path.join(root, ".env.local"))

const databaseUrl = process.env.CUSTOM_SHELL_DATABASE_URL
if (!databaseUrl) {
  console.error(
    "CUSTOM_SHELL_DATABASE_URL is not set, so the webhook secret cannot be read."
  )
  process.exit(1)
}

const client = new Client({ connectionString: databaseUrl })
await client.connect()

let secret
let inboundAddress
try {
  const { rows } = await client.query(
    `select resend_webhook_secret_encrypted, inbound_address
     from email_settings
     where resend_webhook_secret_encrypted is not null
     order by updated_at desc
     limit 1`
  )
  if (rows.length === 0) {
    console.error(
      "No webhook secret is saved. Settings → Email → paste any whsec_… value first; it does not have to be a real one locally."
    )
    process.exit(1)
  }
  // Decrypted by asking the app, not by reimplementing its crypto here: a
  // second copy of that would be one more thing to keep in step.
  let decryptSecret
  try {
    ;({ decryptSecret } = await import("../src/server/auth/encryption.ts"))
  } catch {
    console.error(
      "Run this through tsx, which can read the app's TypeScript: npx tsx scripts/send-sample-inbound.mjs"
    )
    process.exit(1)
  }
  secret = decryptSecret(rows[0].resend_webhook_secret_encrypted)
  inboundAddress = rows[0].inbound_address ?? "leads@example.com"
} finally {
  await client.end()
}

const port = process.env.PORT || "3002"
const url = readArg("url", `http://localhost:${port}/api/webhooks/resend`)
const from = readArg("from", "Sam Okonkwo <sam@newbuyer.com>")
const subject = readArg("subject", "Can you quote a fit-out")

const event = {
  type: "email.received",
  created_at: new Date().toISOString(),
  data: {
    email_id: `local_${randomUUID()}`,
    from,
    to: [inboundAddress],
    received_for: inboundAddress,
    subject,
    message_id: `<${randomUUID()}@newbuyer.com>`,
    attachments: [],
  },
}

const body = JSON.stringify(event)
const id = `msg_local_${randomUUID()}`
const timestamp = String(Math.floor(Date.now() / 1000))
const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64")
const signature = createHmac("sha256", key)
  .update(`${id}.${timestamp}.${body}`)
  .digest("base64")

const response = await fetch(url, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "svix-id": id,
    "svix-timestamp": timestamp,
    "svix-signature": `v1,${signature}`,
  },
  body,
})

const answer = await response.text()
console.log(`${response.status} ${answer}`)
if (!response.ok) process.exit(1)
console.log(`Sent "${subject}" from ${from} to ${inboundAddress}.`)
console.log("Open /admin/crm — it should be at the top of the inbox, unread.")
