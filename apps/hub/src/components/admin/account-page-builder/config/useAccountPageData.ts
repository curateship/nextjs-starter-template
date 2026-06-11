import {
  getAccountPagesAction,
  type AccountPage
} from "@/lib/actions/account-pages/account-pages-actions"
import type { Site } from "@/lib/actions/sites/site-actions"
import { convertJsonToBlocks } from "@/lib/utils/block-utils"
import { isAccountPageBuilderBlockType } from "./account-page-block-types"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { useSiteContentData } from "@/components/admin/layout/builder/useSiteContentData"

// Convert account page rows to editor blocks keyed by page slug
function getBlocksBySlug(pages: AccountPage[]) {
  const blocksData: Record<string, any[]> = {}

  pages.forEach(page => {
    blocksData[page.slug] = convertJsonToBlocks(page.content_blocks || {})
      .filter((block) => isAccountPageBuilderBlockType(block.type))
  })

  return blocksData
}

// Stable reference for the generic hook's fetchItems dependency
function fetchAccountPages(siteId: string, options: { selectedSlug?: string }) {
  return getAccountPagesAction(siteId, options)
}

interface UseAccountPagesDataReturn {
  site: Site | null
  pages: AccountPage[]
  blocks: Record<string, any[]>
  configLoading: boolean
  blocksLoading: boolean
  configError: string
  reloadBlocks: () => Promise<void>
}

export function useAccountPageData(siteId: string, selectedPage = ""): UseAccountPagesDataReturn {
  // Site comes from the site-switcher context — no extra fetch needed
  const { currentSite } = useSiteSwitcher()

  const { site, items: pages, blocks, siteLoading, blocksLoading, siteError, reloadBlocks } = useSiteContentData<AccountPage, any>({
    siteId,
    selectedSlug: selectedPage,
    fetchItems: fetchAccountPages,
    itemsToBlocksBySlug: getBlocksBySlug,
    contextSite: currentSite ?? null,
  })

  // This hook historically exposes config-prefixed names for the loading/error state
  return { site, pages, blocks, configLoading: siteLoading, blocksLoading, configError: siteError, reloadBlocks }
}
