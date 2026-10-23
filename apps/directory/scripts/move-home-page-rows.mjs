/**
 * Moves every site's home page rows out of `directory_front_page_sections` and
 * into that site's own front page, the one the shell's builder edits.
 *
 * CMS had two row builders: the shell's front page, which was app-wide until
 * 27 Sep 2026, and its own per-site one in Settings → Directory. Now that the
 * shell's rows belong to a site and can take kinds from an app, there is one
 * builder, and the rows an admin already built have to end up in it.
 *
 * Run it once per database, before the migration that drops the table:
 *
 *   CUSTOM_SHELL_DATABASE_URL=... node scripts/move-home-page-rows.mjs
 *
 * Safe to run twice. Each moved row keeps an id made from its section's id, so
 * a second run replaces what the first one wrote rather than doubling it.
 * Rows an admin built in the shell's builder are left where they are, after the
 * moved ones.
 */

import { Client } from "pg"

const connectionString = process.env.CUSTOM_SHELL_DATABASE_URL
if (!connectionString) {
  console.error("Set CUSTOM_SHELL_DATABASE_URL to the database to move.")
  process.exit(1)
}

/** The shell's own row fields, which every moved row carries. */
function rowBase(section) {
  return {
    id: `front-page-row-${section.id}`,
    heading: section.heading,
    intro: section.intro ?? "",
    layout: "wide",
    // A row that was centred keeps its centring; every other row follows the
    // site, which is what "inherit" means and what they already did.
    alignment: section.centred ? "center" : "inherit",
    hidden: false,
    device: "all",
    showHeading: true,
    showIntro: true,
    showImage: true,
    showAction: true,
    showStars: true,
    showNote: true,
    showPictures: true,
    showRoles: true,
    showNumbers: true,
    showCaptions: true,
  }
}

/** One section as the shell stores it: a hero, a plans row, or an app row. */
function movedRow(section) {
  const base = rowBase(section)

  if (section.kind === "hero") {
    return {
      ...base,
      kind: "hero",
      action: section.hero_action === "email" ? "email" : "button",
      image: section.hero_image ?? "",
      alt: section.hero_alt ?? "",
      buttonLabel: section.hero_button_label ?? "",
      buttonHref: section.hero_button_href ?? "",
      note: section.hero_note ?? "",
      stars: Number(section.hero_stars ?? 0),
    }
  }

  if (section.kind === "plans") return { ...base, kind: "plans" }

  const settings =
    section.kind === "listings"
      ? {
          categoryId: section.category_id,
          sort: section.sort,
          count: section.listing_count,
          layout: section.layout,
        }
      : section.kind === "categories"
        ? {
            source: section.category_source,
            pickedCategoryIds: section.picked_category_ids ?? [],
            count: section.listing_count,
          }
        : { categoryId: section.category_id, count: section.listing_count }

  return { ...base, kind: "app", appKind: section.kind, settings }
}

const client = new Client({ connectionString })
await client.connect()

try {
  const { rows: sections } = await client.query(
    `SELECT * FROM directory_front_page_sections ORDER BY workspace_id, display_order ASC, id ASC`
  )
  if (sections.length === 0) {
    console.log("No home page rows to move.")
    process.exit(0)
  }

  const bySite = new Map()
  for (const section of sections) {
    const list = bySite.get(section.workspace_id) ?? []
    list.push(section)
    bySite.set(section.workspace_id, list)
  }

  for (const [workspaceId, list] of bySite) {
    const { rows } = await client.query(
      `SELECT name, settings FROM workspaces WHERE id = $1`,
      [workspaceId]
    )
    const site = rows[0]
    if (!site) {
      console.log(`Skipped a site that no longer exists: ${workspaceId}`)
      continue
    }

    const settings = site.settings ?? {}
    const moved = list.map(movedRow)
    const movedIds = new Set(moved.map((row) => row.id))
    const kept = Array.isArray(settings.frontPageRows)
      ? settings.frontPageRows.filter((row) => !movedIds.has(row?.id))
      : []

    await client.query(
      `UPDATE workspaces SET settings = $1, updated_at = now() WHERE id = $2`,
      [{ ...settings, frontPageRows: [...moved, ...kept] }, workspaceId]
    )
    console.log(
      `${site.name}: moved ${moved.length} row${moved.length === 1 ? "" : "s"}, kept ${kept.length} already on the front page.`
    )
  }
} finally {
  await client.end()
}
