// Simulates a source app (e.g. the ai-trading app) pushing a signup into the
// newsletter ingest API. Usage:
//   node scripts/simulate-signup.mjs --secret nlk_... [--email you@example.com]
import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))

function argValue(flag) {
  const index = process.argv.indexOf(flag)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const secret = argValue("--secret") || process.env.NEWSLETTER_CONNECTION_SECRET
if (!secret) {
  console.error(
    "Missing connection secret. Pass --secret nlk_... (create one on the Email settings page) or set NEWSLETTER_CONNECTION_SECRET."
  )
  process.exit(1)
}

const ports = JSON.parse(
  await readFile(path.join(here, "../../../local-apps.json"), "utf8")
)
const port = ports.newsletter
if (!port) {
  console.error("newsletter has no port assigned in local-apps.json")
  process.exit(1)
}

const email =
  argValue("--email") || `signup+${Date.now()}@example.com`

const body = {
  email,
  firstName: "Taylor",
  lastName: "Trader",
  tags: ["trading-signup"],
  customFields: { plan: "pro" },
}

const url = `http://localhost:${port}/api/v1/contacts/ingest`
console.log(`POST ${url}`)
console.log(JSON.stringify(body, null, 2))

const response = await fetch(url, {
  method: "POST",
  headers: {
    authorization: `Bearer ${secret}`,
    "content-type": "application/json",
  },
  body: JSON.stringify(body),
})

const text = await response.text()
console.log(`\n${response.status} ${response.statusText}`)
try {
  console.log(JSON.stringify(JSON.parse(text), null, 2))
} catch {
  console.log(text)
}

if (!response.ok) process.exit(1)
