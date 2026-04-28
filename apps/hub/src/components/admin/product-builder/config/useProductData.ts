import { useState, useEffect, useCallback } from "react"
import { getSiteByIdAction, type SiteWithTheme } from "@/lib/actions/sites/site-actions"
import { getSiteProductsAction } from "@/lib/actions/products/product-actions"
import { convertContentBlocksToArray } from "@/lib/utils/block-utils"
import { getBlockName } from "./product-block-types"

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

function getProductBlocksBySlug(products: Array<{ id: string; slug: string; content_blocks?: Record<string, any> | null }>) {
  const convertedBlocks: Record<string, ProductBlock[]> = {}

  products.forEach((product) => {
    const productBlocks = convertContentBlocksToArray(product.content_blocks || {}, product.id)
    convertedBlocks[product.slug] = productBlocks.map(block => ({
      ...block,
      title: getBlockName(block.type)
    }))
  })

  return convertedBlocks
}

export function useProductData(siteId: string): UseProductDataReturn {
  const [site, setSite] = useState<SiteWithTheme | null>(null)
  const [siteLoading, setSiteLoading] = useState(true)
  const [siteError, setSiteError] = useState("")
  const [blocks, setBlocks] = useState<Record<string, ProductBlock[]>>({})
  const [blocksLoading, setBlocksLoading] = useState(false)

  const loadSiteAndBlocks = useCallback(async () => {
    setSiteLoading(true)
    setBlocksLoading(true)
    setSiteError("")

    try {
      const [siteResult, productsResult] = await Promise.all([
        getSiteByIdAction(siteId),
        getSiteProductsAction(siteId)
      ])
      
      if (siteResult.data) {
        setSite(siteResult.data)
      } else {
        setSiteError(siteResult.error || 'Failed to load site')
      }
      
      if (productsResult.data) {
        setBlocks(getProductBlocksBySlug(productsResult.data))
      } else {
        console.error('Failed to load products:', productsResult.error)
        setBlocks({})
      }

    } catch (error) {
      setSiteError('Failed to load data')
      console.error('Error loading site and products:', error)
    }
    
    setSiteLoading(false)
    setBlocksLoading(false)
  }, [siteId])

  const reloadBlocks = useCallback(async () => {
    setBlocksLoading(true)
    const [siteResult, productsResult] = await Promise.all([
      getSiteByIdAction(siteId),
      getSiteProductsAction(siteId)
    ])

    if (siteResult.data) {
      setSite(siteResult.data)
    }
    
    if (productsResult.data) {
      setBlocks(getProductBlocksBySlug(productsResult.data))
    } else {
      setBlocks({})
    }
    
    setBlocksLoading(false)
  }, [siteId])


  useEffect(() => {
    loadSiteAndBlocks()
  }, [loadSiteAndBlocks])

  return {
    site,
    blocks,
    siteLoading,
    blocksLoading,
    siteError,
    reloadBlocks
  }
}
