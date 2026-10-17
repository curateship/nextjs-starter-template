import { randomUUID } from "node:crypto"
import { pathToFileURL } from "node:url"

import pg from "pg"

/**
 * Bringing the contact list off systemeverything.com into this app, once.
 *
 * systemeverything.com is a website on the old multi-site platform in
 * `apps/hub`, where its contacts live in `newsletter_contacts` keyed by a site
 * id. This app keeps the same people in `contacts` keyed by a workspace. The
 * two tables hold nearly the same facts, so the job is mostly a rename, plus
 * one piece of real repair described under "tags" below.
 *
 * **It only ever reads the old database.** Nothing is written back to
 * systemeverything.com, so running this cannot damage the live site, and
 * running it twice cannot either: see "running it twice".
 *
 * ## What comes across
 *
 * - the address, the name when there is one, and when they joined
 * - where they came from (`source`), so the Notion marketplace buyers stay one
 *   filter away
 * - their tags, repaired
 * - their status, mapped: active becomes subscribed, and cold, unsubscribed,
 *   bounced and complained keep their own names
 *
 * ## What does not, on purpose
 *
 * - **The Notion marketplace purchase fields.** Every one of the 3,820 rows
 *   that has them paid zero and used no coupon, because the templates were free,
 *   and 3,817 of them already carry the template's name as a tag. So the only
 *   facts in those fifteen fields that are not already here are the date and the
 *   locale, which is not worth a column.
 * - **The per-email open history** (`recent_email_activity`). What it was
 *   feeding was the cold status, and the status itself comes across.
 * - **The date somebody opted out.** The old table never recorded one.
 *
 * ## Tags
 *
 * 432 of the old site's 578 tags are several tags stuck together with commas, so
 * one "tag" reads `Imported February 1st, 2025 at 7:28 AM (Gumroad),Cold
 * Subscribers`. Splitting on the comma fixes most of it and breaks the rest,
 * because the date tags contain a comma of their own. So a split piece that is
 * an unfinished "Imported <month> <day>" is joined back onto the year that
 * follows it. 578 tags become about 155.
 *
 * ## Running it twice
 *
 * Safe, and it does not undo anybody's choices. A contact who is already here
 * keeps their status and gains any tags they were missing; only a contact who is
 * new gets a status from the old site. Somebody who unsubscribed in this app
 * after the first run is therefore still unsubscribed after the second, which is
 * the whole reason the status is not refreshed.
 *
 * ## Running it
 *
 *   SOURCE_DATABASE_URL=postgres://… \
 *   CUSTOM_SHELL_DATABASE_URL=postgres://… \
 *   node scripts/import-systemeverything-contacts.mjs --workspace <id>
 *
 * `--dry-run` reads everything, reports exactly what it would write, and writes
 * nothing. `--domain <host>` picks a different site on the old platform.
 */

const { Client } = pg

const DEFAULT_DOMAIN = "systemeverything.com"
/** Enough rows per statement to be fast, few enough to stay readable in a log. */
const WRITE_CHUNK = 500

/**
 * The old site's five statuses, and what each is called here.
 *
 * Every one of them has a home, which is the point: a status the old site used
 * and this app had no word for would quietly become something else, and 9,405
 * people would change meaning without anybody being told.
 */
const STATUS_MAP = {
  active: "subscribed",
  cold: "cold",
  unsubscribed: "unsubscribed",
  bounced: "bounced",
  complained: "complained",
}

function readArgs(argv) {
  const args = { dryRun: false, domain: DEFAULT_DOMAIN, workspaceId: null }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--dry-run") args.dryRun = true
    else if (arg === "--workspace") args.workspaceId = argv[++index]
    else if (arg === "--domain") args.domain = argv[++index]
    else {
      console.error(`Unknown argument: ${arg}`)
      process.exit(1)
    }
  }
  return args
}

/**
 * One stored tag, as the list of real tags it was meant to be.
 *
 * The rejoin is the whole reason this is not a one-line split. "Imported
 * February 1st" and "2025 at 7:28 AM (Gumroad)" are two halves of one tag, and
 * leaving them apart would invent two tags that nobody ever wrote and lose the
 * one they did.
 */
export function splitStoredTag(stored) {
  const pieces = String(stored)
    .split(",")
    .map((piece) => piece.trim())
    .filter(Boolean)

  const tags = []
  for (let index = 0; index < pieces.length; index += 1) {
    const piece = pieces[index]
    const next = pieces[index + 1]
    const unfinishedDate = /^Imported\s+\w+\s+\d{1,2}(st|nd|rd|th)$/i.test(piece)
    const theYear = next && /^\d{4}\s+at\s+/i.test(next)
    if (unfinishedDate && theYear) {
      tags.push(`${piece}, ${next}`)
      index += 1
      continue
    }
    tags.push(piece)
  }
  return tags
}

/** Every tag on one old contact, repaired, deduplicated, order kept. */
export function readTags(metadata) {
  const stored = metadata?.tags
  if (!Array.isArray(stored)) return []
  const seen = new Set()
  const tags = []
  for (const entry of stored) {
    for (const tag of splitStoredTag(entry)) {
      // The shell's own tag column allows 100 characters, so a longer one would
      // be refused by the database rather than silently cut here.
      const trimmed = tag.slice(0, 100)
      const key = trimmed.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      tags.push(trimmed)
    }
  }
  return tags
}

function readName(metadata, field) {
  const value = metadata?.[field]
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, 255) : null
}

async function resolveSite(source, domain) {
  const { rows } = await source.query(
    `select id, name from sites where custom_domain = $1 limit 1`,
    [domain]
  )
  if (rows.length === 0) {
    throw new Error(
      `No site on the old platform has the domain ${domain}. Pass --domain.`
    )
  }
  return rows[0]
}

/**
 * Which workspace the people land in.
 *
 * Never created here. This app serves whichever websites somebody already made,
 * and a script that invented one would put 25,000 strangers into a website
 * nobody asked for.
 */
async function resolveWorkspace(target, workspaceId) {
  if (workspaceId) {
    const { rows } = await target.query(
      `select id, name from workspaces where id = $1`,
      [workspaceId]
    )
    if (rows.length === 0) throw new Error(`No workspace with id ${workspaceId}`)
    return rows[0]
  }

  const { rows } = await target.query(
    `select id, name from workspaces order by created_at`
  )
  if (rows.length === 1) return rows[0]
  throw new Error(
    `This app has ${rows.length} workspaces, so say which one with --workspace <id>:\n` +
      rows.map((row) => `  ${row.id}  ${row.name}`).join("\n")
  )
}

async function main() {
  const args = readArgs(process.argv.slice(2))
  const sourceUrl = process.env.SOURCE_DATABASE_URL
  const targetUrl = process.env.CUSTOM_SHELL_DATABASE_URL

  if (!sourceUrl || !targetUrl) {
    console.error(
      "SOURCE_DATABASE_URL (the old platform) and CUSTOM_SHELL_DATABASE_URL (this app) are both required."
    )
    process.exit(1)
  }

  const source = new Client({ connectionString: sourceUrl })
  const target = new Client({ connectionString: targetUrl })
  await source.connect()
  await target.connect()

  try {
    const site = await resolveSite(source, args.domain)
    const workspace = await resolveWorkspace(target, args.workspaceId)
    console.log(`From  ${args.domain} — site "${site.name}" (${site.id})`)
    console.log(`Into  workspace "${workspace.name}" (${workspace.id})`)

    const { rows: old } = await source.query(
      `select email, status, metadata, created_at, updated_at
         from newsletter_contacts
        where site_id = $1
        order by created_at`,
      [site.id]
    )
    console.log(`Read  ${old.length} contacts`)

    /**
     * Collapsed by lowercased address before anything is written.
     *
     * Two rows differing only in case are one person to this app's unique
     * index, and sending both in one statement is also what makes Postgres
     * refuse the whole chunk with "cannot affect row a second time". The first
     * one wins, which is the oldest, because the read is ordered by join date.
     */
    const byEmail = new Map()
    const unknownStatuses = new Map()
    for (const row of old) {
      const email = String(row.email || "").trim()
      if (!email) continue
      const key = email.toLowerCase()
      if (byEmail.has(key)) continue

      const status = STATUS_MAP[row.status]
      if (!status) {
        unknownStatuses.set(row.status, (unknownStatuses.get(row.status) ?? 0) + 1)
        continue
      }

      byEmail.set(key, {
        email,
        status,
        tags: readTags(row.metadata),
        source: typeof row.metadata?.source === "string" ? row.metadata.source : null,
        firstName: readName(row.metadata, "first_name"),
        lastName: readName(row.metadata, "last_name"),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })
    }

    // Loud, not skipped quietly. A status this script has no word for means the
    // old site grew one after this was written, and leaving those people out
    // silently is how a list ends up missing a group nobody can name.
    if (unknownStatuses.size > 0) {
      console.error(
        `Refusing to guess at ${unknownStatuses.size} unknown status value(s):`
      )
      for (const [status, count] of unknownStatuses) {
        console.error(`  ${status}: ${count} contacts`)
      }
      process.exit(1)
    }

    const contacts = [...byEmail.values()]
    const tagCount = new Set(contacts.flatMap((contact) => contact.tags)).size
    const statusCounts = contacts.reduce((counts, contact) => {
      counts[contact.status] = (counts[contact.status] ?? 0) + 1
      return counts
    }, {})
    console.log(`Ready ${contacts.length} contacts, ${tagCount} distinct tags`)
    for (const [status, count] of Object.entries(statusCounts).sort(
      (a, b) => b[1] - a[1]
    )) {
      console.log(`      ${status}: ${count}`)
    }

    if (args.dryRun) {
      console.log("\nDry run. Nothing was written.")
      return
    }

    let inserted = 0
    let merged = 0
    await target.query("begin")
    for (let start = 0; start < contacts.length; start += WRITE_CHUNK) {
      const chunk = contacts.slice(start, start + WRITE_CHUNK)
      const values = []
      const params = []
      for (const contact of chunk) {
        const at = params.length
        params.push(
          randomUUID(),
          workspace.id,
          contact.email,
          contact.firstName,
          contact.lastName,
          contact.source,
          contact.tags,
          contact.status,
          contact.createdAt,
          contact.updatedAt
        )
        values.push(
          `($${at + 1}, $${at + 2}, $${at + 3}, $${at + 4}, $${at + 5}, $${at + 6}, $${at + 7}::text[], $${at + 8}, $${at + 9}, $${at + 10})`
        )
      }

      /**
       * On a clash: tags are merged and nothing else is overwritten.
       *
       * The address already being here means it is one of this app's own
       * accounts or somebody added by hand, and both of those know more about
       * the person than a copy of an old list does. Their status especially:
       * overwriting it would put somebody who unsubscribed here back on the
       * list. The merge is the one safe direction, because a tag is a label and
       * not a decision.
       */
      const { rows: written } = await target.query(
        `insert into contacts
           (id, workspace_id, email, first_name, last_name, source, tags, status, created_at, updated_at)
         values ${values.join(", ")}
         on conflict (workspace_id, lower(email)) do update
            set tags = (
                  select coalesce(array_agg(distinct tag), '{}'::text[])
                    from unnest(contacts.tags || excluded.tags) as tag
                ),
                updated_at = excluded.updated_at
         returning (xmax = 0) as is_new`,
        params
      )
      for (const row of written) {
        if (row.is_new) inserted += 1
        else merged += 1
      }
      console.log(
        `Wrote ${Math.min(start + WRITE_CHUNK, contacts.length)}/${contacts.length}`
      )
    }
    await target.query("commit")

    console.log(`\nAdded ${inserted}, merged into ${merged} already here.`)
  } catch (error) {
    await target.query("rollback").catch(() => {})
    throw error
  } finally {
    await source.end()
    await target.end()
  }
}

// Importable for its own tests without connecting to anything. Comparing the
// module's own URL with the one Node was started on, rather than matching the
// file name: a renamed copy would match nothing and do nothing at all, with no
// error to say why.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error.message)
    process.exit(1)
  })
}
