import { and, asc, eq } from "drizzle-orm"

import {
  APP_FRONT_PAGE_ROW_KIND,
  MAX_FRONT_PAGE_ROWS,
  frontPageRowImageUrls,
  normalizeFrontPageRows,
  visibleFrontPageRows,
  type FrontPageRow,
} from "@/lib/pages/front-page"
import { MAX_PAGE_PATH_LENGTH } from "@/lib/pages/page-descriptor"
import { pageForPath } from "@/lib/pages/page-registry"
import { findWrittenPage } from "@/server/content/written-pages"
import { isOwnedImageUrl } from "@/server/media/library"
import { db, type CustomShellDb } from "@/server/db"
import { customShellPageBlocks } from "@/server/schema"
import { now } from "@/server/auth/security"

/**
 * The blocks a public page is built from.
 *
 * One row per block, keyed by the site and the page's address. Three things
 * follow from that and none of them did before, when the blocks were an array
 * inside the app-wide settings row:
 *
 * - **A second page can have blocks.** The blob had room for one list.
 * - **Saving one block writes one row.** A whole-settings save is how one
 *   admin's edit came to erase another's.
 * - **A site's blocks are the site's.** No fork between "the app-wide list" and
 *   "this site's list" that the two readers could disagree about.
 *
 * Every block is read back through `normalizeFrontPageRows`, the same function
 * the settings save used, so a hand-edited row cannot put anything on a public
 * page that the editor would not have allowed.
 */

/**
 * A block on its way into the database.
 *
 * `block` is deliberately untyped: it came off the wire, and what it is gets
 * decided by `normalizeFrontPageRows` below rather than by whatever shape the
 * sender claimed.
 */
export type PageBlockInput = {
  path: string
  block: unknown
}

/**
 * Turns stored rows back into the shape the page draws, and drops anything
 * that is no longer a block this app can render.
 */
function rowsToBlocks(
  rows: {
    id: string
    kind: string
    appKind: string | null
    settings: unknown
  }[]
): FrontPageRow[] {
  return normalizeFrontPageRows(
    rows.map((row) => ({
      ...(row.settings && typeof row.settings === "object" ? row.settings : {}),
      id: row.id,
      kind: row.kind,
      ...(row.appKind ? { appKind: row.appKind } : {}),
    }))
  )
}

/**
 * Everything except the three columns that are not settings.
 *
 * Spread from a union, so the result is named again: `id`, `kind` and `appKind`
 * are columns of their own and the rest is the jsonb. Nothing here reads the
 * fields, so widening them costs nothing — `normalizeFrontPageRows` is what
 * decides what they are on the way back in.
 */
function blockSettings(block: FrontPageRow): Record<string, unknown> {
  const { id: _id, kind: _kind, ...rest } = block
  if ("appKind" in rest) {
    const { appKind: _appKind, ...withoutAppKind } = rest
    return withoutAppKind
  }
  return rest
}

/**
 * Whether this address is a page that may hold blocks at all.
 *
 * Checked on the way in as well as on the way out: without it, a save could
 * write blocks to an address with no page behind it, and they would sit in the
 * table forever, drawn by nothing and listed nowhere.
 *
 * **Two kinds of page answer yes.** One the code declares, whose `*.page.ts`
 * card says `blocks`, and one an admin added, which is every page in the
 * `written_pages` table — those exist to be built. The second needs the site
 * as well as the address, because an address is one page within a site.
 */
export async function pathHoldsBlocks(
  workspaceId: string,
  path: string,
  database: CustomShellDb = db
): Promise<boolean> {
  if (pageForPath(path)?.blocks) return true
  return Boolean(await findWrittenPage(workspaceId, path, database))
}

/**
 * Every block on one page of one site, in order, including the hidden ones.
 * This is the admin's read: the editor has to list a hidden block to let
 * somebody unhide it.
 */
export async function readPageBlocks(
  workspaceId: string,
  path: string,
  database: CustomShellDb = db
): Promise<FrontPageRow[]> {
  const rows = await database
    .select({
      id: customShellPageBlocks.id,
      kind: customShellPageBlocks.kind,
      appKind: customShellPageBlocks.appKind,
      settings: customShellPageBlocks.settings,
    })
    .from(customShellPageBlocks)
    .where(
      and(
        eq(customShellPageBlocks.workspaceId, workspaceId),
        eq(customShellPageBlocks.path, path)
      )
    )
    .orderBy(asc(customShellPageBlocks.position))
    .limit(MAX_FRONT_PAGE_ROWS)

  return rowsToBlocks(rows)
}

/**
 * What a visitor may see on one page: the same list without the blocks an
 * admin has hidden.
 *
 * A hidden block is dropped here rather than left in and hidden with a class,
 * so a page being built over several sittings cannot have its words read out
 * of the page source before it is ready.
 */
export async function readVisiblePageBlocks(
  workspaceId: string | null,
  path: string,
  database: CustomShellDb = db
): Promise<FrontPageRow[]> {
  if (!workspaceId) return []
  return visibleFrontPageRows(await readPageBlocks(workspaceId, path, database))
}

/**
 * Writes one block and leaves every other block alone.
 *
 * A new block joins the end of the page. An existing one keeps the place it
 * already had, because saving a block's wording is not a request to move it.
 *
 * **The picture check is the reason this takes the admin's id.** A new picture
 * has to be one of theirs; a picture the block was already carrying does not,
 * or an admin would be asked to re-own an image their page has been drawing
 * for months. The same rule the settings save had.
 */
export async function writePageBlock(
  userId: string,
  workspaceId: string,
  input: PageBlockInput,
  database: CustomShellDb = db
): Promise<FrontPageRow> {
  const path = input.path.slice(0, MAX_PAGE_PATH_LENGTH)
  if (!(await pathHoldsBlocks(workspaceId, path, database))) {
    throw new Error("That page is not built from blocks.")
  }

  // Through the same normaliser the read uses, so what is stored is what the
  // page will draw rather than whatever the browser happened to send.
  const [block] = normalizeFrontPageRows([input.block])
  if (!block) {
    throw new Error(
      "That block is missing something it needs before it can go on the page."
    )
  }

  const existing = await database
    .select({
      id: customShellPageBlocks.id,
      position: customShellPageBlocks.position,
      kind: customShellPageBlocks.kind,
      appKind: customShellPageBlocks.appKind,
      settings: customShellPageBlocks.settings,
    })
    .from(customShellPageBlocks)
    .where(
      and(
        eq(customShellPageBlocks.workspaceId, workspaceId),
        eq(customShellPageBlocks.path, path)
      )
    )
    .orderBy(asc(customShellPageBlocks.position))

  const saved = existing.find((row) => row.id === block.id)
  if (!saved && existing.length >= MAX_FRONT_PAGE_ROWS) {
    throw new Error("This page already holds as many blocks as it can.")
  }

  const alreadyMine = new Set(
    frontPageRowImageUrls(saved ? rowsToBlocks([saved]) : [])
  )
  for (const image of new Set(frontPageRowImageUrls([block]))) {
    if (alreadyMine.has(image)) continue
    if (!(await isOwnedImageUrl(userId, image, database))) {
      throw new Error(
        "A picture on that block is no longer in your media library. Pick another one."
      )
    }
  }

  const at = now()
  const values = {
    id: block.id,
    workspaceId,
    path,
    position: saved?.position ?? existing.length,
    kind: block.kind,
    appKind: block.kind === APP_FRONT_PAGE_ROW_KIND ? block.appKind : null,
    settings: blockSettings(block),
    createdAt: at,
    updatedAt: at,
  }

  await database
    .insert(customShellPageBlocks)
    .values(values)
    .onConflictDoUpdate({
      target: [customShellPageBlocks.workspaceId, customShellPageBlocks.id],
      set: {
        // Not the path: a block belongs to the page it was made on, and moving
        // one between pages is a feature nobody has asked for. Not the position
        // either — `writePageBlockOrder` owns that.
        kind: values.kind,
        appKind: values.appKind,
        settings: values.settings,
        updatedAt: values.updatedAt,
      },
    })

  return block
}

/**
 * Writes the order of one page's blocks and nothing else.
 *
 * Ids the page does not hold are ignored rather than refused: a list dragged
 * in a tab that was open while somebody else deleted a block should still be
 * able to say what order the rest are in.
 */
export async function writePageBlockOrder(
  workspaceId: string,
  path: string,
  ids: readonly string[],
  database: CustomShellDb = db
): Promise<void> {
  const held = await database
    .select({ id: customShellPageBlocks.id })
    .from(customShellPageBlocks)
    .where(
      and(
        eq(customShellPageBlocks.workspaceId, workspaceId),
        eq(customShellPageBlocks.path, path)
      )
    )

  const known = new Set(held.map((row) => row.id))
  const ordered = ids.filter((id) => known.has(id))
  // Anything the request left out keeps its place behind the ones it named,
  // so a stale list can never drop a block off the page.
  const rest = held.map((row) => row.id).filter((id) => !ordered.includes(id))
  const final = [...ordered, ...rest]

  const at = now()
  // One transaction, because half an order is worse than none: a page whose
  // first three blocks moved and whose last three did not is a page nobody
  // asked for, and the drag that made it would look as though it worked.
  await database.transaction(async (tx) => {
    for (const [position, id] of final.entries()) {
      await tx
        .update(customShellPageBlocks)
        .set({ position, updatedAt: at })
        .where(
          and(
            eq(customShellPageBlocks.workspaceId, workspaceId),
            eq(customShellPageBlocks.id, id)
          )
        )
    }
  })
}

/** Takes one block off a page. Deleting one that is already gone is not an error. */
export async function deletePageBlock(
  workspaceId: string,
  id: string,
  database: CustomShellDb = db
): Promise<void> {
  await database
    .delete(customShellPageBlocks)
    .where(
      and(
        eq(customShellPageBlocks.workspaceId, workspaceId),
        eq(customShellPageBlocks.id, id)
      )
    )
}

/**
 * How many blocks each of this site's pages holds, for the Pages screen.
 *
 * One query for the whole screen rather than one per row, because the screen
 * already draws every page the registry knows about.
 */
export async function readPageBlockCounts(
  workspaceId: string,
  database: CustomShellDb = db
): Promise<Record<string, number>> {
  const rows = await database
    .select({
      path: customShellPageBlocks.path,
      id: customShellPageBlocks.id,
    })
    .from(customShellPageBlocks)
    .where(eq(customShellPageBlocks.workspaceId, workspaceId))

  const counts: Record<string, number> = {}
  for (const row of rows) {
    counts[row.path] = (counts[row.path] ?? 0) + 1
  }
  return counts
}
