import { useState, useEffect, useCallback } from "react"
import { getSiteByIdAction, type SiteWithTheme } from "@/lib/actions/sites/site-actions"
import { getSitePagesAction, type Page } from "@/lib/actions/pages/page-actions"
import { convertJsonToBlocks } from "@/lib/utils/block-utils"

function getContentOnlyBlocks(contentBlocks: Record<string, any>) {
  return convertJsonToBlocks(contentBlocks)
}

function getBlocksBySlug(pages: Page[]) {
  const blocksData: Record<string, any[]> = {}

  pages.forEach(page => {
    blocksData[page.slug] = getContentOnlyBlocks(page.content_blocks || {})
  })

  return blocksData
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

export function usePageData(siteId: string): UsePageDataReturn {
  const [site, setSite] = useState<SiteWithTheme | null>(null)
  const [pages, setPages] = useState<Page[]>([])
  const [siteLoading, setSiteLoading] = useState(true)
  const [siteError, setSiteError] = useState("")
  const [blocks, setBlocks] = useState<Record<string, any[]>>({
    home: [],
    about: [],
    contact: []
  })
  const [blocksLoading, setBlocksLoading] = useState(false)

  const loadSiteAndBlocks = useCallback(async () => {
    setSiteLoading(true)
    setBlocksLoading(true)
    setSiteError("")

    try {
      // Load site and pages in parallel for speed
      const [siteResult, pagesResult] = await Promise.all([
        getSiteByIdAction(siteId),
        getSitePagesAction(siteId)
      ])

      if (siteResult.data) {
        setSite(siteResult.data)
      } else {
        setSiteError(siteResult.error || 'Failed to load site')
      }

      if (pagesResult.data) {
        setPages(pagesResult.data)
        setBlocks(getBlocksBySlug(pagesResult.data))
      } else {
        console.error('Failed to load pages:', pagesResult.error)
      }
    } catch (error) {
      setSiteError('Failed to load data')
      console.error('Error loading site and pages:', error)
    }

    setSiteLoading(false)
    setBlocksLoading(false)
  }, [siteId])

  const reloadBlocks = useCallback(async () => {
    setBlocksLoading(true)
    
    // Need to reload both site and pages data to get updated navigation/footer
    const [siteResult, pagesResult] = await Promise.all([
      getSiteByIdAction(siteId),
      getSitePagesAction(siteId)
    ])
    
    if (siteResult.data) {
      setSite(siteResult.data)
    }
    
    if (pagesResult.data) {
      setPages(pagesResult.data)
      setBlocks(getBlocksBySlug(pagesResult.data))
    }
    setBlocksLoading(false)
  }, [siteId])

  useEffect(() => {
    loadSiteAndBlocks()
  }, [loadSiteAndBlocks])

  return {
    site,
    pages,
    blocks,
    siteLoading,
    blocksLoading,
    siteError,
    reloadBlocks
  }
}
