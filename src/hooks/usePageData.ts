import { useState, useEffect } from "react"
import { getSiteByIdAction, type SiteWithTheme } from "@/lib/actions/site-actions"
import { getSiteBlocksAction, type Block } from "@/lib/actions/page-blocks-actions"

interface UsePageDataReturn {
  site: SiteWithTheme | null
  blocks: Record<string, Block[]>
  siteLoading: boolean
  blocksLoading: boolean
  siteError: string
  reloadBlocks: () => Promise<void>
}

export function usePageData(siteId: string): UsePageDataReturn {
  const [site, setSite] = useState<SiteWithTheme | null>(null)
  const [siteLoading, setSiteLoading] = useState(true)
  const [siteError, setSiteError] = useState("")
  const [blocks, setBlocks] = useState<Record<string, Block[]>>({
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
      // Load site and blocks in parallel for speed
      const [siteResult, blocksResult] = await Promise.all([
        getSiteByIdAction(siteId),
        getSiteBlocksAction(siteId)
      ])
      
      if (siteResult.data) {
        setSite(siteResult.data)
      } else {
        setSiteError(siteResult.error || 'Failed to load site')
      }
      
      if (blocksResult.success && blocksResult.blocks) {
        setBlocks(blocksResult.blocks)
      } else {
        console.error('Failed to load blocks:', blocksResult.error)
      }
    } catch (error) {
      setSiteError('Failed to load data')
      console.error('Error loading site and blocks:', error)
    }
    
    setSiteLoading(false)
    setBlocksLoading(false)
  }

  const reloadBlocks = async () => {
    setBlocksLoading(true)
    const blocksResult = await getSiteBlocksAction(siteId)
    if (blocksResult.success && blocksResult.blocks) {
      setBlocks(blocksResult.blocks)
    }
    setBlocksLoading(false)
  }

  useEffect(() => {
    loadSiteAndBlocks()
  }, [siteId]) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    site,
    blocks,
    siteLoading,
    blocksLoading,
    siteError,
    reloadBlocks
  }
}