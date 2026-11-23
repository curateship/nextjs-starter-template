import type { FrontPageListedPageChoice } from "@/components/pages/front-page-listed-pages-editor"
import { loadPageBlocks } from "@/lib/api/content/page-blocks"
import { loadWrittenPageForEdit, type PagesOverview, type PublicPageRow, type WrittenPage } from "@/lib/api/content/pages"
import type { FrontPageRow } from "@/lib/pages/front-page"

/** What the page builder needs for one page. */
export type PageEditorData = {
  page: PublicPageRow
  blocks: FrontPageRow[]
  /** The row behind a page an admin added, or null for one the code declares. */
  writtenPage: WrittenPage | null
  /** Every page added to this site, for a Pages list block to pick from. */
  pageChoices: FrontPageListedPageChoice[]
}

/**
 * The page builder's reads for the page at `path`, off a Pages overview the
 * caller already has, so the list costs no request of its own. Null for a
 * page that is not built from blocks, which has nothing to build: the list is
 * the honest place to land. The page's own card decides, so an app that gives
 * a second page blocks gets the builder with no change here.
 */
export async function loadPageEditor(path: string, overview: PagesOverview): Promise<PageEditorData | null> {
  const page = overview.rows.find((row) => row.path === path)
  if (!page?.blocks) return null
  // The page's own row, when an admin added it. A page the code declares has
  // none, and its name and address are in its file rather than in a table.
  const [blocks, writtenPage] = await Promise.all([
    loadPageBlocks(path),
    page.writtenPageId ? loadWrittenPageForEdit(path) : null,
  ])
  // Every page added to this site, in the Pages list's own order. The page
  // being built is left out: a card linking to the page it sits on goes
  // nowhere.
  const pageChoices = overview.rows.flatMap((row) =>
    row.writtenPageId && row.path !== path
      ? [{ id: row.writtenPageId, title: row.name, path: row.path, visibility: row.visibility }]
      : []
  )
  return { page, blocks, writtenPage, pageChoices }
}
