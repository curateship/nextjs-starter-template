import { type SiteWithTheme } from "@/lib/actions/sites/site-actions"
import { getSitePagesAction, type Page } from "@/lib/actions/pages/page-actions"
import { convertJsonToBlocks } from "@/lib/utils/block-utils"
import { useSiteContentData } from "@/components/admin/layout/builder/useSiteContentData"

// Convert page rows to editor blocks keyed by page slug
function getBlocksBySlug(pages: Page[]) {
  const blocksData: Record<string, any[]> = {}

  pages.forEach(page => {
    blocksData[page.slug] = convertJsonToBlocks(page.content_blocks || {})
  })

  return blocksData
}

// Stable reference for the generic hook's fetchItems dependency
function fetchPages(siteId: string, options: { selectedSlug?: string }) {
  return getSitePagesAction({ data: { siteId: siteId, options: options } })
}

interface UsePageDataReturn {
  site: SiteWithTheme | null
  pages: Page[]
  blocks: Record<string, any[]>
  siteLoading: boolean
  blocksLoading: boolean
  siteError: string
  reloadBlocks: () => Promise<void>
}

// Default slugs rendered before the first fetch resolves
const INITIAL_BLOCKS: Record<string, any[]> = { home: [], about: [], contact: [] }

export function usePageData(siteId: string, selectedPage = ""): UsePageDataReturn {
  const { items: pages, ...rest } = useSiteContentData<Page, any>({
    siteId,
    selectedSlug: selectedPage,
    fetchItems: fetchPages,
    itemsToBlocksBySlug: getBlocksBySlug,
    reloadSite: true, // saving pages can change site navigation/footer
    initialBlocks: INITIAL_BLOCKS,
  })

  return { pages, ...rest }
}
