/**
 * Takes the emails that are nobody's inbox out of every listing's saved links.
 *
 * The rule is `isJunkEmail` in `src/lib/directory/contact-links.ts`, the same
 * function that already hides these addresses when a listing is read or saved.
 * This only makes the stored rows match, so the admin's edit form, the
 * duplicate check and anything reading the column straight see the same
 * links the public page does.
 *
 * Without `--write` it changes nothing and lists what it would take out. Run
 * twice, the second run finds nothing. Needs `CUSTOM_SHELL_DATABASE_URL`,
 * read from `.env.local` when it is there.
 *
 *   npm run drop:junk-emails            # look first
 *   npm run drop:junk-emails -- --write
 */
import path from "node:path"
import { fileURLToPath } from "node:url"

import pg from "pg"

import { isJunkEmail } from "../src/lib/directory/contact-links.ts"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

try {
  process.loadEnvFile(path.join(root, ".env.local"))
} catch (error) {
  if (error?.code !== "ENOENT") throw error
}

const write = process.argv.includes("--write")
const url = process.env.CUSTOM_SHELL_DATABASE_URL
if (!url) throw new Error("Set CUSTOM_SHELL_DATABASE_URL to the Directory database address.")

const client = new pg.Client({ connectionString: url })
await client.connect()

try {
  const { rows } = await client.query(
    `select id, title, contact_links
       from directory_listings
      where jsonb_typeof(contact_links->'menuLinks') = 'array'`
  )

  let listings = 0
  let emails = 0
  await client.query("begin")
  for (const row of rows) {
    const links = row.contact_links
    const kept = links.menuLinks.filter(
      (link) => !(link?.type === "email" && isJunkEmail(String(link.value ?? "")))
    )
    const dropped = links.menuLinks.length - kept.length
    if (!dropped) continue

    listings += 1
    emails += dropped
    console.log(`${row.title}: ${dropped} taken out`)
    if (write) {
      await client.query(
        "update directory_listings set contact_links = $2 where id = $1",
        [row.id, { ...links, menuLinks: kept }]
      )
    }
  }
  await client.query(write ? "commit" : "rollback")

  console.log(
    write
      ? `Took ${emails} junk emails out of ${listings} listings.`
      : `${emails} junk emails on ${listings} listings. Nothing changed: run again with --write.`
  )
} catch (error) {
  await client.query("rollback").catch(() => {})
  throw error
} finally {
  await client.end()
}
