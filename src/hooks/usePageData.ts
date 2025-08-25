import { useState, useEffect } from "react"
import { getSiteByIdAction, type SiteWithTheme } from "@/lib/actions/sites/site-actions"
import { getSitePagesAction, type Page } from "@/lib/actions/pages/page-actions"
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
          
          // Add navigation and footer from site data to each page
          // This maintains the UI illusion that nav/footer are page blocks
          const siteBlocks = []
          if (siteResult.data?.settings?.navigation) {
            siteBlocks.push({
              id: 'site-navigation',
              type: 'navigation',
              title: 'Navigation',
              content: siteResult.data.settings.navigation,
              display_order: -1 // Show at top
            })
          }
          if (siteResult.data?.settings?.footer) {
            siteBlocks.push({
              id: 'site-footer',
              type: 'footer', 
              title: 'Footer',
              content: siteResult.data.settings.footer,
              display_order: 999 // Show at bottom
            })
          }
          
          // Combine and sort all blocks by display_order
          const allBlocks = [...siteBlocks, ...pageBlocks]
          allBlocks.sort((a, b) => (a.display_order || 0) - (b.display_order || 0))
          blocksData[page.slug] = allBlocks
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
      
      // Convert JSON content_blocks to blocks format for each page
      const blocksData: Record<string, any[]> = {}
      pagesResult.data.forEach(page => {
        const pageBlocks = convertPageJsonToBlocks(page.content_blocks || {})
        
        // Add navigation and footer from site data to each page
        const siteBlocks = []
        if (siteResult.data?.settings?.navigation) {
          siteBlocks.push({
            id: 'site-navigation',
            type: 'navigation',
            title: 'Navigation',
            content: siteResult.data.settings.navigation,
            display_order: -1
          })
        }
        if (siteResult.data?.settings?.footer) {
          siteBlocks.push({
            id: 'site-footer',
            type: 'footer',
            title: 'Footer', 
            content: siteResult.data.settings.footer,
            display_order: 999
          })
        }
        
        // Combine and sort all blocks by display_order
        const allBlocks = [...siteBlocks, ...pageBlocks]
        allBlocks.sort((a, b) => (a.display_order || 0) - (b.display_order || 0))
        blocksData[page.slug] = allBlocks
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