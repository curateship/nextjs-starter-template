import { useState, useEffect } from "react"
import { getSiteByIdAction, type SiteWithTheme } from "@/lib/actions/site-actions"
import { getSiteProductsAction } from "@/lib/actions/product-actions"
import { getSitePagesAction } from "@/lib/actions/page-actions"
import { convertContentBlocksToArray, getProductBlockTitle } from "@/lib/utils/product-block-utils"
import { convertPageJsonToBlocks } from "@/lib/utils/page-block-utils"

interface ProductBlock {
  id: string
  type: string
  title: string
  content: Record<string, any>
}

interface UseProductDataReturn {
  site: SiteWithTheme | null
  blocks: Record<string, ProductBlock[]>
  siteBlocks: Record<string, any[]>
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
  const [siteBlocks, setSiteBlocks] = useState<Record<string, any[]>>({})
  const [blocksLoading, setBlocksLoading] = useState(false)

  const loadSiteAndBlocks = async () => {
    setSiteLoading(true)
    setBlocksLoading(true)
    setSiteError("")
    
    try {
      // Load site, products, and pages in parallel for speed
      const [siteResult, productsResult, pagesResult] = await Promise.all([
        getSiteByIdAction(siteId),
        getSiteProductsAction(siteId),
        getSitePagesAction(siteId)
      ])
      
      if (siteResult.data) {
        setSite(siteResult.data)
      } else {
        setSiteError(siteResult.error || 'Failed to load site')
      }
      
      if (productsResult.data) {
        // Convert products with JSON content_blocks to the block format the UI expects
        const convertedBlocks: Record<string, ProductBlock[]> = {}
        
        productsResult.data.forEach((product) => {
          // Convert JSON content_blocks to block array format
          const productBlocks = convertContentBlocksToArray(product.content_blocks || {}, product.id)
          
          // Add titles to blocks
          const blocksWithTitles = productBlocks.map(block => ({
            ...block,
            title: getProductBlockTitle(block.type)
          }))
          
          convertedBlocks[product.slug] = blocksWithTitles
        })
        
        setBlocks(convertedBlocks)
      } else {
        console.error('Failed to load products:', productsResult.error)
        setBlocks({})
      }

      // Load site blocks (navigation, footer) from pages
      if (pagesResult.data) {
        const siteBlocksData: Record<string, any[]> = {}
        pagesResult.data.forEach(page => {
          const pageBlocks = convertPageJsonToBlocks(page.content_blocks || {})
          siteBlocksData[page.slug] = pageBlocks
        })
        setSiteBlocks(siteBlocksData)
      } else {
        console.error('Failed to load pages:', pagesResult.error)
        setSiteBlocks({})
      }
    } catch (error) {
      setSiteError('Failed to load data')
      console.error('Error loading site and products:', error)
    }
    
    setSiteLoading(false)
    setBlocksLoading(false)
  }

  const reloadBlocks = async () => {
    setBlocksLoading(true)
    const productsResult = await getSiteProductsAction(siteId)
    
    if (productsResult.data) {
      // Convert products with JSON content_blocks to the block format the UI expects
      const convertedBlocks: Record<string, ProductBlock[]> = {}
      
      productsResult.data.forEach((product) => {
        // Convert JSON content_blocks to block array format
        const productBlocks = convertContentBlocksToArray(product.content_blocks || {}, product.id)
        
        // Add titles to blocks
        const blocksWithTitles = productBlocks.map(block => ({
          ...block,
          title: getProductBlockTitle(block.type)
        }))
        
        convertedBlocks[product.slug] = blocksWithTitles
      })
      
      setBlocks(convertedBlocks)
    } else {
      setBlocks({})
    }
    
    setBlocksLoading(false)
  }


  useEffect(() => {
    loadSiteAndBlocks()
  }, [siteId]) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    site,
    blocks,
    siteBlocks,
    siteLoading,
    blocksLoading,
    siteError,
    reloadBlocks
  }
}