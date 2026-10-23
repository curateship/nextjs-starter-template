/**
 * Loads the fields the Eat Drink Toronto import left behind.
 *
 * The import copied listings, categories and photos, and wrote everything it
 * had no home for into `dropped.json` — opening hours as free text, and one
 * "Tags" block per listing. This puts those two into CMS: hours on the listing
 * itself, and the tags into a custom section of the site's own.
 *
 * It is safe to run twice. Nothing is written unless it differs from what is
 * already there, and the report says how many rows actually changed, so a
 * second run reporting zero is the proof.
 *
 * The hours need nothing but `dropped.json`. The tags need the old database as
 * well, because the labels on them — "Popular for", "Atmosphere" — were never
 * written to the file. So running without `--source-site` loads the hours and
 * says in the report that the tags were left for a run that has the old
 * database.
 *
 * Coordinates are in `dropped.json` too, and there are none: the old site
 * never had any. Nothing here looks for them.
 */
import { randomUUID } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

import pg from "pg"

import {
  parseHoursText,
  translateTemplateFields,
  translateValues,
} from "./translate.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
/** How many listings are read back in one round trip. */
const CHUNK = 200

const LAYOUTS = {
  stack: "stack",
  "stack-card": "card",
  "two-column": "two-column",
}

await main()

async function main() {
  await loadEnv(path.join(root, ".env.local"))
  const options = parseArguments(process.argv.slice(2))
  const sourceUrl = process.env.DIRECTORY_SOURCE_DATABASE_URL
  const targetUrl = process.env.CUSTOM_SHELL_DATABASE_URL
  if (!targetUrl) {
    throw new Error(
      "Set CUSTOM_SHELL_DATABASE_URL to the CMS database address."
    )
  }
  // The tags are only attempted when there is an old database to read their
  // labels from. Asked for without one, the run stops rather than inventing
  // names for six fields.
  const wantsTags = Boolean(options.sourceSite)
  if (wantsTags && !sourceUrl) {
    throw new Error(
      "Set DIRECTORY_SOURCE_DATABASE_URL to the old app's read-only database address, or drop --source-site to load the hours on their own."
    )
  }

  const dropped = JSON.parse(await readFile(options.dropped, "utf8"))
  const source = wantsTags
    ? new pg.Client({ connectionString: sourceUrl })
    : null
  const target = new pg.Client({ connectionString: targetUrl })
  const report = newReport(options, dropped)

  try {
    if (source) await source.connect()
    await target.connect()

    const templates = source
      ? await readTemplates(source, options.sourceSite)
      : new Map()
    const workspace = await targetWorkspace(target, options.site)

    // A dry run reads everything and writes nothing. It counts what it would
    // change rather than running inside a read-only transaction, which would
    // simply refuse the first write and take the report down with it.
    const sections = source
      ? await ensureSections(
          target,
          workspace.id,
          templates,
          dropped,
          options.dryRun,
          report
        )
      : new Map()
    await loadListings(
      target,
      workspace.id,
      dropped,
      sections,
      options.dryRun,
      report
    )
  } finally {
    await source?.end().catch(() => undefined)
    await target.end().catch(() => undefined)
  }

  report.finishedAt = new Date().toISOString()
  await mkdir(options.output, { recursive: true })
  await writeFile(
    path.join(options.output, "fields-report.json"),
    `${JSON.stringify(report, null, 2)}\n`
  )
  console.log(JSON.stringify(report, null, 2))
}

/** The old site's custom block templates, by id. */
async function readTemplates(client, siteId) {
  const result = await client.query(
    `
      SELECT id::text, name, slug, layout, COALESCE(fields, '[]'::jsonb) AS fields
      FROM directory_custom_blocks
      WHERE site_id = $1
    `,
    [siteId]
  )
  return new Map(result.rows.map((row) => [row.id, row]))
}

async function targetWorkspace(client, slug) {
  const result = await client.query(
    "SELECT id FROM workspaces WHERE subdomain = $1 LIMIT 1",
    [slug]
  )
  const workspace = result.rows[0]
  if (!workspace) throw new Error(`The CMS site ${slug} does not exist.`)
  return workspace
}

/**
 * One CMS section per old template the listings actually use.
 *
 * A section already carrying the right slug is reused with its own field keys,
 * so running this after somebody has renamed the section in the admin screen
 * does not make a second copy of it.
 */
async function ensureSections(
  client,
  workspaceId,
  templates,
  dropped,
  dryRun,
  report
) {
  const usedTemplateIds = new Set()
  for (const entry of Object.values(dropped)) {
    for (const block of entry.custom ?? []) {
      const id = block?.content?.templateId
      if (id) usedTemplateIds.add(id)
    }
  }

  const sections = new Map()
  for (const templateId of usedTemplateIds) {
    const template = templates.get(templateId)
    if (!template) {
      report.missingTemplates.push(templateId)
      continue
    }

    const translated = translateTemplateFields(template.fields, randomUUID)
    report.skippedFields.push(
      ...translated.skipped.map((field) => ({
        template: template.name,
        ...field,
      }))
    )

    const slug = String(template.slug || "tags").slice(0, 80)
    const existing = await client.query(
      `
        SELECT id, fields FROM directory_custom_sections
        WHERE workspace_id = $1 AND slug = $2 LIMIT 1
      `,
      [workspaceId, slug]
    )

    if (existing.rows[0]) {
      // The section is already here. Its own keys win, matched to the old
      // template's by label, so answers land where the admin screen expects.
      const current = existing.rows[0].fields ?? []
      const byLabel = new Map(
        current.map((field) => [String(field.label).toLowerCase(), field])
      )
      const keyMap = new Map()
      for (const [oldKey, target] of translated.keyMap) {
        const field = translated.fields.find((item) => item.key === target.key)
        const here = byLabel.get(String(field?.label).toLowerCase())
        if (here) keyMap.set(oldKey, { key: here.key, type: here.type })
      }
      sections.set(templateId, { slug, keyMap })
      report.sectionsReused += 1
      continue
    }

    const at = new Date().toISOString()
    if (dryRun) {
      sections.set(templateId, { slug, keyMap: translated.keyMap })
      report.sectionsCreated += 1
      continue
    }
    await client.query(
      `
        INSERT INTO directory_custom_sections
          (id, workspace_id, name, slug, layout, fields, display_order, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $8)
      `,
      [
        randomUUID(),
        workspaceId,
        String(template.name || "Tags").slice(0, 80),
        slug,
        LAYOUTS[template.layout] ?? "stack",
        JSON.stringify(translated.fields),
        0,
        at,
      ]
    )
    sections.set(templateId, { slug, keyMap: translated.keyMap })
    report.sectionsCreated += 1
  }

  return sections
}

/** Hours and tags, one listing at a time, writing only what differs. */
async function loadListings(
  client,
  workspaceId,
  dropped,
  sections,
  dryRun,
  report
) {
  const ids = Object.keys(dropped)

  for (let index = 0; index < ids.length; index += CHUNK) {
    const chunk = ids.slice(index, index + CHUNK)
    const current = await client.query(
      `
        SELECT id, hours, custom_values
        FROM directory_listings
        WHERE workspace_id = $1 AND id = ANY($2::varchar[])
      `,
      [workspaceId, chunk]
    )
    const byId = new Map(current.rows.map((row) => [row.id, row]))

    for (const id of chunk) {
      const row = byId.get(id)
      if (!row) {
        report.listingsMissing += 1
        continue
      }
      const entry = dropped[id]
      const next = {}

      const hoursText = entry.openingHours?.[0]?.content?.hoursText ?? ""
      if (hoursText.trim()) {
        const parsed = parseHoursText(hoursText)
        report.dayLinesRead += parsed.read
        report.dayLinesUnreadable += parsed.unreadable
        report.listingsWithHoursText += 1
        if (!sameJson(row.hours, parsed.hours)) next.hours = parsed.hours
      } else {
        report.listingsWithoutHoursText += 1
      }

      const values = { ...(row.custom_values ?? {}) }
      let tagsChanged = false
      for (const block of entry.custom ?? []) {
        const section = sections.get(block?.content?.templateId)
        if (!section) continue
        const translated = translateValues(
          block.content?.values,
          section.keyMap
        )
        if (!Object.keys(translated).length) continue
        if (!sameJson(values[section.slug], translated)) {
          values[section.slug] = translated
          tagsChanged = true
        }
        report.listingsWithTags += 1
      }
      if (tagsChanged) next.customValues = values

      if (!Object.keys(next).length) {
        report.listingsUnchanged += 1
        continue
      }

      if (dryRun) {
        if (next.hours) report.hoursWritten += 1
        if (next.customValues) report.tagsWritten += 1
        report.listingsChanged += 1
        continue
      }

      await client.query(
        `
          UPDATE directory_listings
          SET hours = COALESCE($3::jsonb, hours),
              custom_values = COALESCE($4::jsonb, custom_values),
              updated_at = now()
          WHERE id = $1 AND workspace_id = $2
        `,
        [
          id,
          workspaceId,
          next.hours ? JSON.stringify(next.hours) : null,
          next.customValues ? JSON.stringify(next.customValues) : null,
        ]
      )
      if (next.hours) report.hoursWritten += 1
      if (next.customValues) report.tagsWritten += 1
      report.listingsChanged += 1
    }
  }
}

/**
 * The same value, whatever order the keys are in.
 *
 * Postgres hands `jsonb` back with its own key order, so a plain
 * `JSON.stringify` comparison called every listing different on a second run
 * and rewrote all 3,018 of them.
 */
function sameJson(left, right) {
  return stable(left ?? null) === stable(right ?? null)
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable(value[key])}`)
      .join(",")}}`
  }
  return JSON.stringify(value)
}

function newReport(options, dropped) {
  return {
    dryRun: options.dryRun,
    sourceSite: options.sourceSite,
    tags: options.sourceSite ? "loaded" : "skipped, no --source-site",
    targetSite: options.site,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    droppedListings: Object.keys(dropped).length,
    sectionsCreated: 0,
    sectionsReused: 0,
    missingTemplates: [],
    skippedFields: [],
    listingsMissing: 0,
    listingsWithHoursText: 0,
    listingsWithoutHoursText: 0,
    listingsWithTags: 0,
    dayLinesRead: 0,
    dayLinesUnreadable: 0,
    hoursWritten: 0,
    tagsWritten: 0,
    listingsChanged: 0,
    listingsUnchanged: 0,
  }
}

function parseArguments(arguments_) {
  const result = {
    site: "",
    sourceSite: "",
    dryRun: false,
    output: path.join(root, "import-eatdrinktoronto-output"),
    dropped: "",
  }
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index]
    if (argument === "--") continue
    if (argument === "--dry-run") result.dryRun = true
    else if (argument === "--site")
      result.site = optionValue(arguments_, index, argument)
    else if (argument === "--source-site")
      result.sourceSite = optionValue(arguments_, index, argument)
    else if (argument === "--output")
      result.output = path.resolve(optionValue(arguments_, index, argument))
    else if (argument === "--dropped")
      result.dropped = path.resolve(optionValue(arguments_, index, argument))
  }

  if (!result.site) throw new Error("Pass --site <cms-site-slug>.")
  if (!result.dropped) result.dropped = path.join(result.output, "dropped.json")
  return result
}

function optionValue(arguments_, index, name) {
  const value = arguments_[index + 1]
  if (!value || value.startsWith("--"))
    throw new Error(`${name} needs a value.`)
  return value
}

function loadEnv(filename) {
  try {
    process.loadEnvFile(filename)
  } catch (error) {
    if (error?.code === "ENOENT") return
    throw error
  }
}
