import { useState, useEffect } from "react"
import { getSiteByIdAction, type SiteWithTheme } from "@/lib/actions/site-actions"
import { getSitePagesAction, type Page } from "@/lib/actions/page-actions"
import { convertPageJsonToBlocks } from "@/lib/utils/page-block-utils"

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

  const loadSiteAndBlocks = async () => {
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
        
        // Convert JSON content_blocks to blocks format for each page
        const blocksData: Record<string, any[]> = {}
        pagesResult.data.forEach(page => {
          const pageBlocks = convertPageJsonToBlocks(page.content_blocks || {})
          blocksData[page.slug] = pageBlocks
        })
        setBlocks(blocksData)
      } else {
        console.error('Failed to load pages:', pagesResult.error)
      }
    } catch (error) {
      setSiteError('Failed to load data')
      console.error('Error loading site and pages:', error)
    }
    
    setSiteLoading(false)
    setBlocksLoading(false)
  }

  const reloadBlocks = async () => {
    setBlocksLoading(true)
    const pagesResult = await getSitePagesAction(siteId)
    if (pagesResult.data) {
      setPages(pagesResult.data)
      
      // Convert JSON content_blocks to blocks format for each page
      const blocksData: Record<string, any[]> = {}
      pagesResult.data.forEach(page => {
        const pageBlocks = convertPageJsonToBlocks(page.content_blocks || {})
        blocksData[page.slug] = pageBlocks
      })
      setBlocks(blocksData)
    }
    setBlocksLoading(false)
  }

  useEffect(() => {
    loadSiteAndBlocks()
  }, [siteId]) // eslint-disable-line react-hooks/exhaustive-deps

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