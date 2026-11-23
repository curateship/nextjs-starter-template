import { and, asc, desc, eq, exists, ilike, inArray, or, sql } from "drizzle-orm"

import { cleanWrittenPageBody, writtenPageText } from "@/lib/pages/written-page-body"
import {
  searchSnippet,
  siteSearchPattern,
  type SiteSearchResult,
} from "@/lib/pages/site-search"
import { appSiteSearchResults } from "@/server/app-options"
import { db, type CustomShellDb } from "@/server/db"
import {
  customShellPageBlocks,
  customShellWorkspaces,
  customShellWrittenPages,
} from "@/server/schema"

export const SITE_SEARCH_LIMIT = 40

/**
 * Search every public source for one site and keep the answer small.
 *
 * There is deliberately no search index, fuzzy matching or ranking service.
 * A plain text match with title matches first is enough for sites of this
 * size; adding machinery before there is evidence for it would only add more
 * places for visibility and site boundaries to drift.
 */
export async function searchSite(
  workspaceId: string,
  rawQuery: string,
  database: CustomShellDb = db
): Promise<SiteSearchResult[]> {
  const query = rawQuery.trim()
  if (!query) return []

  const [pages, appResults] = await Promise.all([
    searchWrittenPages(workspaceId, query, SITE_SEARCH_LIMIT, database),
    appSiteSearchResults(workspaceId, query, SITE_SEARCH_LIMIT),
  ])

  return [...pages, ...appResults]
    .sort((left, right) => {
      const leftTitle = titleMatches(left.title, query)
      const rightTitle = titleMatches(right.title, query)
      if (leftTitle !== rightTitle) return leftTitle ? -1 : 1
      return left.title < right.title ? -1 : left.title > right.title ? 1 : 0
    })
    .slice(0, SITE_SEARCH_LIMIT)
}

/**
 * Public pages an admin added, on one site, with visibility enforced in the
 * query.
 *
 * **The words are blocks now, so the match is against the blocks.** A page's
 * words used to be a column on the page's own row, which made this one query;
 * it is two, because the words of one page are several rows and the snippet
 * needs them in order.
 */
export async function searchWrittenPages(
  workspaceId: string,
  rawQuery: string,
  limit: number,
  database: CustomShellDb = db
): Promise<SiteSearchResult[]> {
  const query = rawQuery.trim()
  if (!query || limit < 1) return []

  const pattern = siteSearchPattern(query)
  const blockText = sql<string>`jsonb_path_query_array(${customShellPageBlocks.settings}->'body', '$.**.text')::text`
  const visibility = sql<string>`coalesce(${customShellWorkspaces.settings}->'pages'->${customShellWrittenPages.path}->>'visibility', 'everyone')`

  const rows = await database
    .select({
      path: customShellWrittenPages.path,
      title: customShellWrittenPages.title,
    })
    .from(customShellWrittenPages)
    .innerJoin(
      customShellWorkspaces,
      eq(customShellWorkspaces.id, customShellWrittenPages.workspaceId)
    )
    .where(
      and(
        eq(customShellWrittenPages.workspaceId, workspaceId),
        // Only the two valid private values hide a page. A malformed saved
        // value falls back to everyone, matching normalizePageOverrides.
        sql<boolean>`${visibility} not in ('members', 'off')`,
        or(
          ilike(customShellWrittenPages.title, pattern),
          exists(
            database
              .select({ one: sql`1` })
              .from(customShellPageBlocks)
              .where(
                and(
                  eq(
                    customShellPageBlocks.workspaceId,
                    customShellWrittenPages.workspaceId
                  ),
                  eq(customShellPageBlocks.path, customShellWrittenPages.path),
                  eq(customShellPageBlocks.kind, "words"),
                  ilike(blockText, pattern)
                )
              )
          )
        )
      )
    )
    .orderBy(
      desc(ilike(customShellWrittenPages.title, pattern)),
      asc(customShellWrittenPages.title),
      asc(customShellWrittenPages.path)
    )
    .limit(limit)

  if (rows.length === 0) return []

  // The words of every page that matched, in the order they are drawn, so a
  // snippet reads as the page does rather than as the database returned it.
  const blocks = await database
    .select({
      path: customShellPageBlocks.path,
      settings: customShellPageBlocks.settings,
    })
    .from(customShellPageBlocks)
    .where(
      and(
        eq(customShellPageBlocks.workspaceId, workspaceId),
        eq(customShellPageBlocks.kind, "words"),
        inArray(
          customShellPageBlocks.path,
          rows.map((row) => row.path)
        )
      )
    )
    .orderBy(asc(customShellPageBlocks.path), asc(customShellPageBlocks.position))

  const wordsByPath = new Map<string, string[]>()
  for (const block of blocks) {
    const body = (block.settings as { body?: unknown } | null)?.body
    const text = writtenPageText(cleanWrittenPageBody(body))
    if (!text) continue
    wordsByPath.set(block.path, [...(wordsByPath.get(block.path) ?? []), text])
  }

  return rows.map((row) => ({
    type: "Page",
    title: row.title,
    snippet: searchSnippet((wordsByPath.get(row.path) ?? []).join(" "), query),
    path: row.path,
  }))
}

function titleMatches(title: string, query: string) {
  return title.toLocaleLowerCase().includes(query.toLocaleLowerCase())
}
