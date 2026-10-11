import { and, asc, eq, inArray, ne } from "drizzle-orm"

import {
  MAX_FRONT_PAGE_IMAGE_ALT_LENGTH,
  MAX_WRITTEN_PAGE_DESCRIPTION,
  normalizeFrontPageImageUrl,
} from "@/lib/pages/front-page"
import { normalizeCanonicalUrl } from "@/lib/pages/page-indexing"
import { pageForPath } from "@/lib/pages/page-registry"
import { db, type CustomShellDb } from "@/server/db"
import {
  customShellPageBlocks,
  customShellWrittenPages,
} from "@/server/schema"
import { now, uuid } from "@/server/auth/security"

/**
 * Pages an admin added, rather than pages the code declares.
 *
 * **This row is the page, not its content.** Its address, its name and what
 * search engines are told about it live here; the words a visitor reads, and
 * everything else on the page, are blocks in `page_blocks` like the front
 * page's. They were one body of words in a column here until 4 Oct 2026, when
 * Tyler's answer to "how do I add a page that is block enabled" was that every
 * page he adds should be one. See `0087_custom_shell_written_pages_as_blocks.sql`.
 */

export type WrittenPage = {
  id: string
  path: string
  title: string
  /**
   * Keeps the page out of search results: it carries `noindex` and is left
   * out of the sitemap. The link still works for anyone who has it.
   */
  hiddenFromSearch: boolean
  /** The address that counts when the same words answer on two addresses. */
  canonicalUrl: string
  /**
   * The page's own picture, drawn at the top of the page above its blocks, or
   * empty for a page with none.
   */
  image: string
  /** What a screen reader says in place of that picture. */
  imageAlt: string
  /**
   * A line or two about the page, or empty. Drawn under its name on every
   * Pages list card that lists it, and the page's search description.
   */
  description: string
  createdAt: Date
  updatedAt: Date
}

export const MAX_WRITTEN_PAGE_TITLE = 200

/**
 * Addresses an admin may not claim, whatever the registry happens to hold
 * today. These are the app's own machinery: a written page at `/api/...` or
 * `/admin/...` would either never be reached or would shadow something that
 * matters, and either way the admin would be left wondering why.
 */
const RESERVED_PREFIXES = ["/admin", "/api", "/_"] as const

/**
 * Turns what somebody typed into the address it will actually answer on, so
 * "About " and "/about/" cannot become two different pages.
 */
export function normalizeWrittenPagePath(raw: string): string {
  const trimmed = raw.trim().toLowerCase()
  const withSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`
  // A trailing slash is the same page, so it is not a different address.
  const withoutTrailing =
    withSlash.length > 1 ? withSlash.replace(/\/+$/, "") : withSlash
  return withoutTrailing.replace(/\/{2,}/g, "/").slice(0, 160)
}

/** Addresses are plain: letters, numbers, dashes and slashes between them. */
const VALID_PATH = /^\/[a-z0-9]+(?:[-/][a-z0-9]+)*$/

/**
 * Why this address cannot be used, or null when it can.
 *
 * Said as a sentence rather than a code, because every one of these is
 * something the admin typed and can fix, and the modal shows it back to them.
 */
export function writtenPagePathProblem(path: string): string | null {
  if (path === "/" || path.length < 2) {
    return "An address needs something after the slash, like /about."
  }
  if (!VALID_PATH.test(path)) {
    return "An address can use letters, numbers and dashes, like /about-us."
  }
  if (RESERVED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) {
    return "That address belongs to the app itself. Try another."
  }
  // The code pages are the other half of the answer. The registry is the only
  // list that knows them, and it is why this check lives on the server rather
  // than in the database's unique index.
  const codePage = pageForPath(path)
  if (codePage) {
    return `${codePage.name} already answers on ${path}.`
  }
  return null
}

function toWrittenPage(row: {
  id: string
  path: string
  title: string
  hiddenFromSearch: boolean
  canonicalUrl: string
  image: string
  imageAlt: string
  description: string
  createdAt: Date
  updatedAt: Date
}): WrittenPage {
  return {
    id: row.id,
    path: row.path,
    title: row.title,
    hiddenFromSearch: row.hiddenFromSearch,
    // Cleaned on the way out for the same reason the body is, and it is the
    // last point before the address reaches a canonical tag.
    canonicalUrl: normalizeCanonicalUrl(row.canonicalUrl),
    // And the picture on the way out as well, so a row edited by hand cannot
    // put anything but a web address of a picture into a page's `src`.
    image: normalizeFrontPageImageUrl(row.image),
    imageAlt: row.imageAlt,
    description: row.description,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

/** The picture and its name as they are stored: a web address, or nothing. */
function pictureValues(input: { image?: string; imageAlt?: string }) {
  const image = normalizeFrontPageImageUrl(input.image)
  return {
    image,
    // No picture is no name either. A name left behind by a cleared picture
    // would be read out by a screen reader with nothing to read it about.
    imageAlt: image
      ? (input.imageAlt ?? "").trim().slice(0, MAX_FRONT_PAGE_IMAGE_ALT_LENGTH)
      : "",
  }
}

/** The description as it is stored: trimmed, and never past the column. */
function cleanDescription(value: string | undefined) {
  return (value ?? "").trim().slice(0, MAX_WRITTEN_PAGE_DESCRIPTION)
}

/**
 * The pages one Pages list block names, on one site, in the order it names
 * them. An id that is not a page on this site is left out, whether it was
 * deleted or never belonged here: the site is part of the lookup, so a block
 * can never show another site's page.
 */
export async function listWrittenPagesByIds(
  workspaceId: string,
  ids: readonly string[],
  database: CustomShellDb = db
): Promise<WrittenPage[]> {
  if (ids.length === 0) return []
  const rows = await database
    .select()
    .from(customShellWrittenPages)
    .where(
      and(
        eq(customShellWrittenPages.workspaceId, workspaceId),
        inArray(customShellWrittenPages.id, [...ids])
      )
    )
  const byId = new Map(rows.map((row) => [row.id, toWrittenPage(row)]))
  return ids.flatMap((id) => {
    const page = byId.get(id)
    return page ? [page] : []
  })
}

export async function listWrittenPages(
  workspaceId: string,
  database: CustomShellDb = db
): Promise<WrittenPage[]> {
  const rows = await database
    .select()
    .from(customShellWrittenPages)
    .where(eq(customShellWrittenPages.workspaceId, workspaceId))
    .orderBy(asc(customShellWrittenPages.path))
  return rows.map(toWrittenPage)
}

/**
 * The two columns the sitemap needs, without loading every page's body.
 *
 * A page hidden from search never reaches the list. Leaving it in would hand a
 * search engine the exact address the `noindex` tag on it is asking them to
 * forget, which is the one thing that makes the switch look broken.
 */
export async function listWrittenPageSitemapEntries(
  workspaceId: string,
  database: CustomShellDb = db
): Promise<Array<{ path: string; updatedAt: Date }>> {
  return database
    .select({
      path: customShellWrittenPages.path,
      updatedAt: customShellWrittenPages.updatedAt,
    })
    .from(customShellWrittenPages)
    .where(
      and(
        eq(customShellWrittenPages.workspaceId, workspaceId),
        eq(customShellWrittenPages.hiddenFromSearch, false)
      )
    )
    .orderBy(asc(customShellWrittenPages.path))
}

/**
 * One page by address on one site, or null — what the public route asks.
 *
 * The site comes first because it is what makes the address mean anything: the
 * same `/about` is a different page on each domain the deployment answers, and
 * a lookup that left the site out would hand whichever one it found first to
 * every visitor.
 */
export async function findWrittenPage(
  workspaceId: string,
  path: string,
  database: CustomShellDb = db
): Promise<WrittenPage | null> {
  const [row] = await database
    .select()
    .from(customShellWrittenPages)
    .where(
      and(
        eq(customShellWrittenPages.workspaceId, workspaceId),
        eq(customShellWrittenPages.path, normalizeWrittenPagePath(path))
      )
    )
    .limit(1)
  return row ? toWrittenPage(row) : null
}

/**
 * One page by its id, within one site, or null.
 *
 * The address is the usual way in, which is why `findWrittenPage` takes one.
 * This one exists for a save that may be *changing* the address, and for the
 * picture check that has to know what the page is drawing now.
 */
export async function findWrittenPageById(
  workspaceId: string,
  id: string,
  database: CustomShellDb = db
): Promise<WrittenPage | null> {
  const [row] = await database
    .select()
    .from(customShellWrittenPages)
    .where(
      and(
        eq(customShellWrittenPages.workspaceId, workspaceId),
        eq(customShellWrittenPages.id, id)
      )
    )
    .limit(1)
  return row ? toWrittenPage(row) : null
}

async function pathIsTaken(
  workspaceId: string,
  path: string,
  exceptId: string | null,
  database: CustomShellDb
): Promise<boolean> {
  const [row] = await database
    .select({ id: customShellWrittenPages.id })
    .from(customShellWrittenPages)
    .where(
      and(
        eq(customShellWrittenPages.workspaceId, workspaceId),
        eq(customShellWrittenPages.path, path),
        exceptId ? ne(customShellWrittenPages.id, exceptId) : undefined
      )
    )
    .limit(1)
  return Boolean(row)
}

export async function createWrittenPage(
  workspaceId: string,
  input: {
    path: string
    title: string
    hiddenFromSearch?: boolean
    canonicalUrl?: string
    image?: string
    imageAlt?: string
    description?: string
  },
  database: CustomShellDb = db
): Promise<WrittenPage> {
  const path = normalizeWrittenPagePath(input.path)
  const problem = writtenPagePathProblem(path)
  if (problem) throw new Error(problem)

  const title = input.title.trim().slice(0, MAX_WRITTEN_PAGE_TITLE)
  if (!title) throw new Error("A page needs a title.")

  if (await pathIsTaken(workspaceId, path, null, database)) {
    throw new Error(`Another page already answers on ${path}.`)
  }

  const at = now()
  const [row] = await database
    .insert(customShellWrittenPages)
    .values({
      id: uuid(),
      workspaceId,
      path,
      title,
      hiddenFromSearch: input.hiddenFromSearch ?? false,
      canonicalUrl: normalizeCanonicalUrl(input.canonicalUrl),
      ...pictureValues(input),
      description: cleanDescription(input.description),
      createdAt: at,
      updatedAt: at,
    })
    .returning()

  if (!row) throw new Error("The page was not created.")
  return toWrittenPage(row)
}

export async function updateWrittenPage(
  workspaceId: string,
  id: string,
  input: {
    path?: string
    title?: string
    hiddenFromSearch?: boolean
    canonicalUrl?: string
    image?: string
    imageAlt?: string
    description?: string
  },
  database: CustomShellDb = db
): Promise<WrittenPage> {
  const values: Record<string, unknown> = { updatedAt: now() }
  // Where the page answers now, so its blocks can be moved if it moves. They
  // are keyed by address rather than by the page's id, which is what lets a
  // page the code declares have blocks at all.
  const [before] = await database
    .select({ path: customShellWrittenPages.path })
    .from(customShellWrittenPages)
    .where(
      and(
        eq(customShellWrittenPages.id, id),
        eq(customShellWrittenPages.workspaceId, workspaceId)
      )
    )
    .limit(1)

  if (input.path !== undefined) {
    const path = normalizeWrittenPagePath(input.path)
    const problem = writtenPagePathProblem(path)
    if (problem) throw new Error(problem)
    if (await pathIsTaken(workspaceId, path, id, database)) {
      throw new Error(`Another page already answers on ${path}.`)
    }
    values.path = path
  }

  if (input.title !== undefined) {
    const title = input.title.trim().slice(0, MAX_WRITTEN_PAGE_TITLE)
    if (!title) throw new Error("A page needs a title.")
    values.title = title
  }

  if (input.hiddenFromSearch !== undefined) {
    values.hiddenFromSearch = input.hiddenFromSearch
  }

  // An address that does not survive the normalizer is stored as empty, which
  // is the page having no opinion, the same as never having filled it in.
  if (input.canonicalUrl !== undefined) {
    values.canonicalUrl = normalizeCanonicalUrl(input.canonicalUrl)
  }

  // An empty address is a picture being taken off the page, which is a real
  // edit, so the field is read whenever the caller sent one at all.
  if (input.image !== undefined) {
    Object.assign(values, pictureValues(input))
  }

  if (input.description !== undefined) {
    values.description = cleanDescription(input.description)
  }

  const [row] = await database
    .update(customShellWrittenPages)
    .set(values)
    // Another site's page is simply not found, rather than refused: a site
    // nobody is in should not be able to confirm what it holds.
    .where(
      and(
        eq(customShellWrittenPages.id, id),
        eq(customShellWrittenPages.workspaceId, workspaceId)
      )
    )
    .returning()

  if (!row) throw new Error("That page no longer exists.")

  // The blocks follow the address. Without this a renamed page comes back
  // empty and its words are stranded at an address nothing answers on.
  if (before && before.path !== row.path) {
    await database
      .update(customShellPageBlocks)
      .set({ path: row.path, updatedAt: now() })
      .where(
        and(
          eq(customShellPageBlocks.workspaceId, workspaceId),
          eq(customShellPageBlocks.path, before.path)
        )
      )
  }

  return toWrittenPage(row)
}

export async function deleteWrittenPage(
  workspaceId: string,
  id: string,
  database: CustomShellDb = db
): Promise<{ path: string }> {
  const [row] = await database
    .delete(customShellWrittenPages)
    .where(
      and(
        eq(customShellWrittenPages.id, id),
        eq(customShellWrittenPages.workspaceId, workspaceId)
      )
    )
    .returning({ path: customShellWrittenPages.path })

  if (!row) throw new Error("That page no longer exists.")

  // And the blocks go with it. Left behind they would be invisible — nothing
  // lists an address with no page — until somebody made a page on that address
  // again and found somebody else's words already on it.
  await database
    .delete(customShellPageBlocks)
    .where(
      and(
        eq(customShellPageBlocks.workspaceId, workspaceId),
        eq(customShellPageBlocks.path, row.path)
      )
    )

  return row
}
