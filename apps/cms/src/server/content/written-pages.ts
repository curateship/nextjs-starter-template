import { asc, eq, ne, and } from "drizzle-orm"

import { pageForPath } from "@/lib/pages/page-registry"
import {
  cleanWrittenPageBody,
  type WrittenPageNode,
} from "@/lib/pages/written-page-body"
import { db, type CustomShellDb } from "@/server/db"
import { customShellWrittenPages } from "@/server/schema"
import { now, uuid } from "@/server/auth/security"

/**
 * Pages an admin wrote, rather than pages the code declares.
 *
 * **The boundary this feature is not allowed to cross:** a written page is a
 * title, an address and a body of words. There are no sections, no layout
 * choices, no components and no fields. Every "can it also…" request lands
 * here, and the answer is that the page gets written as code instead — that is
 * the standing decision that killed the block builder, and widening this file
 * is how it would come back.
 */

export type WrittenPage = {
  id: string
  path: string
  title: string
  body: WrittenPageNode
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
  body: unknown
  createdAt: Date
  updatedAt: Date
}): WrittenPage {
  return {
    id: row.id,
    path: row.path,
    title: row.title,
    // Cleaned on the way out as well as in. A row can predate a change to what
    // is allowed, or have been edited straight in the database, and this is
    // the last point before the words reach a public page.
    body: cleanWrittenPageBody(row.body),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
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

/** The two columns the sitemap needs, without loading every page's body. */
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
    .where(eq(customShellWrittenPages.workspaceId, workspaceId))
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
  input: { path: string; title: string; body: unknown },
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
      body: cleanWrittenPageBody(input.body),
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
  input: { path?: string; title?: string; body?: unknown },
  database: CustomShellDb = db
): Promise<WrittenPage> {
  const values: Record<string, unknown> = { updatedAt: now() }

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

  if (input.body !== undefined) values.body = cleanWrittenPageBody(input.body)

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
  return row
}
