import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm"

import { cleanWrittenPageBody, writtenPageText } from "@/lib/pages/written-page-body"
import {
  searchSnippet,
  siteSearchPattern,
  type SiteSearchResult,
} from "@/lib/pages/site-search"
import { appSiteSearchResults } from "@/server/app-options"
import { db, type CustomShellDb } from "@/server/db"
import { customShellWorkspaces, customShellWrittenPages } from "@/server/schema"

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

/** Public written pages on one site, with visibility enforced in the query. */
export async function searchWrittenPages(
  workspaceId: string,
  rawQuery: string,
  limit: number,
  database: CustomShellDb = db
): Promise<SiteSearchResult[]> {
  const query = rawQuery.trim()
  if (!query || limit < 1) return []

  const pattern = siteSearchPattern(query)
  const bodyText = sql<string>`jsonb_path_query_array(${customShellWrittenPages.body}, '$.**.text')::text`
  const visibility = sql<string>`coalesce(${customShellWorkspaces.settings}->'pages'->${customShellWrittenPages.path}->>'visibility', 'everyone')`

  const rows = await database
    .select({
      path: customShellWrittenPages.path,
      title: customShellWrittenPages.title,
      body: customShellWrittenPages.body,
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
        or(ilike(customShellWrittenPages.title, pattern), ilike(bodyText, pattern))
      )
    )
    .orderBy(
      desc(ilike(customShellWrittenPages.title, pattern)),
      asc(customShellWrittenPages.title),
      asc(customShellWrittenPages.path)
    )
    .limit(limit)

  return rows.map((row) => ({
    type: "Page",
    title: row.title,
    snippet: searchSnippet(writtenPageText(cleanWrittenPageBody(row.body)), query),
    path: row.path,
  }))
}

function titleMatches(title: string, query: string) {
  return title.toLocaleLowerCase().includes(query.toLocaleLowerCase())
}
