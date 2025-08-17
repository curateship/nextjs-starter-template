import { useState, useEffect } from "react"
import { getSiteByIdAction, type SiteWithTheme } from "@/lib/actions/site-actions"
import { getAllProductBlocksAction } from "@/lib/actions/product-blocks-actions"

interface ProductBlock {
  id: string
  type: string
  title: string
  content: Record<string, any>
}

interface UseProductDataReturn {
  site: SiteWithTheme | null
  blocks: Record<string, ProductBlock[]>
  siteLoading: boolean
  blocksLoading: boolean
  siteError: string
  reloadBlocks: () => Promise<void>
}

export function useProductData(siteId: string): UseProductDataReturn {
  const [site, setSite] = useState<SiteWithTheme | null>(null)
  const [siteLoading, setSiteLoading] = useState(true)
  const [siteError, setSiteError] = useState("")
  const [blocks, setBlocks] = useState<Record<string, ProductBlock[]>>({})
  const [blocksLoading, setBlocksLoading] = useState(false)

  const loadSiteAndBlocks = async () => {
    setSiteLoading(true)
    setBlocksLoading(true)
    setSiteError("")
    
    // Load site info
    const siteResult = await getSiteByIdAction(siteId)
    if (siteResult.data) {
      setSite(siteResult.data)
      
      // Load product blocks
      const blocksResult = await getAllProductBlocksAction(siteId)
      if (blocksResult.success && blocksResult.blocks) {
        setBlocks(blocksResult.blocks)
      } else {
        console.error('Failed to load blocks:', blocksResult.error)
      }
    } else {
      setSiteError(siteResult.error || 'Failed to load site')
    }
    
    setSiteLoading(false)
    setBlocksLoading(false)
  }

  const reloadBlocks = async () => {
    setBlocksLoading(true)
    const blocksResult = await getAllProductBlocksAction(siteId)
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