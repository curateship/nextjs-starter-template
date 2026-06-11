import { useState, useEffect, useCallback } from "react"
import { getSiteByIdAction, type SiteWithTheme } from "@/lib/actions/sites/site-actions"

/**
 * Generic data hook shared by the content builders (pages, products, categories,
 * events, account pages). Loads the site plus the content items for a site, and
 * exposes the items' blocks keyed by item slug.
 *
 * Variation points are passed in by each builder's thin wrapper hook:
 * - fetchItems: the per-content-type list server action
 * - itemsToBlocksBySlug: converts item rows to editor block arrays keyed by slug
 * - contextSite: when provided (from the site-switcher provider), the site is taken
 *   from context instead of fetched by ID
 * - reloadSite: when true, reloadBlocks also refetches the site (needed where saving
 *   can change site-level data like navigation/footer)
 */
export interface UseSiteContentDataOptions<TItem, TBlock> {
  siteId: string
  selectedSlug?: string
  fetchItems: (siteId: string, options: { selectedSlug?: string }) => Promise<{ data: TItem[] | null; error: string | null }>
  itemsToBlocksBySlug: (items: TItem[]) => Record<string, TBlock[]>
  contextSite?: SiteWithTheme | null
  reloadSite?: boolean
  initialBlocks?: Record<string, TBlock[]>
}

export interface UseSiteContentDataReturn<TItem, TBlock> {
  site: SiteWithTheme | null
  items: TItem[]
  blocks: Record<string, TBlock[]>
  siteLoading: boolean
  blocksLoading: boolean
  siteError: string
  reloadBlocks: () => Promise<void>
}

export function useSiteContentData<TItem, TBlock>({
  siteId,
  selectedSlug = "",
  fetchItems,
  itemsToBlocksBySlug,
  contextSite,
  reloadSite = false,
  initialBlocks,
}: UseSiteContentDataOptions<TItem, TBlock>): UseSiteContentDataReturn<TItem, TBlock> {
  // contextSite === undefined means "fetch the site by ID"; null means context hasn't resolved yet
  const usesContextSite = contextSite !== undefined
  const [site, setSite] = useState<SiteWithTheme | null>(usesContextSite ? contextSite : null)
  const [items, setItems] = useState<TItem[]>([])
  const [siteLoading, setSiteLoading] = useState(usesContextSite ? !contextSite : true)
  const [siteError, setSiteError] = useState("")
  const [blocks, setBlocks] = useState<Record<string, TBlock[]>>(initialBlocks ?? {})
  const [blocksLoading, setBlocksLoading] = useState(false)

  const loadSiteAndBlocks = useCallback(async () => {
    setSiteLoading(true)
    setBlocksLoading(true)
    setSiteError("")

    try {
      // Site comes from context when available; otherwise fetch it alongside the items
      const [siteResult, itemsResult] = await Promise.all([
        usesContextSite
          ? Promise.resolve({ data: contextSite ?? null, error: null as string | null })
          : getSiteByIdAction(siteId),
        fetchItems(siteId, { selectedSlug }),
      ])

      if (siteResult.data) {
        setSite(siteResult.data)
      } else {
        setSiteError(siteResult.error || 'Failed to load site')
      }

      if (itemsResult.data) {
        setItems(itemsResult.data)
        setBlocks(itemsToBlocksBySlug(itemsResult.data))
      } else {
        // Keep last-good items/blocks on a failed fetch so the editor isn't wiped
        console.error('Failed to load content items:', itemsResult.error)
      }
    } catch (error) {
      setSiteError('Failed to load data')
      console.error('Error loading site and content items:', error)
    }

    setSiteLoading(false)
    setBlocksLoading(false)
  }, [usesContextSite, contextSite, selectedSlug, siteId, fetchItems, itemsToBlocksBySlug])

  const reloadBlocks = useCallback(async () => {
    setBlocksLoading(true)

    // Saving can change site-level data (navigation/footer), so some builders refetch the site too
    const [siteResult, itemsResult] = await Promise.all([
      usesContextSite
        ? Promise.resolve({ data: contextSite ?? null, error: null as string | null })
        : reloadSite
          ? getSiteByIdAction(siteId)
          : Promise.resolve({ data: null, error: null as string | null }),
      fetchItems(siteId, { selectedSlug }),
    ])

    if (siteResult.data) {
      setSite(siteResult.data)
    }

    if (itemsResult.data) {
      setItems(itemsResult.data)
      setBlocks(itemsToBlocksBySlug(itemsResult.data))
    }

    setBlocksLoading(false)
  }, [usesContextSite, contextSite, reloadSite, selectedSlug, siteId, fetchItems, itemsToBlocksBySlug])

  useEffect(() => {
    loadSiteAndBlocks()
  }, [loadSiteAndBlocks])

  return {
    site,
    items,
    blocks,
    siteLoading,
    blocksLoading,
    siteError,
    reloadBlocks,
  }
}
