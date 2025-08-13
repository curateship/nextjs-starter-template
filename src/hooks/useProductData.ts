import { useState, useEffect } from "react"
import { getSiteProductsAction, type Product } from "@/lib/actions/product-actions"
import { getProductBlocksAction } from "@/lib/actions/product-blocks-actions"
import { useSiteContext } from "@/contexts/site-context"

interface ProductBlock {
  id: string
  type: string
  title: string
  content: Record<string, any>
}

interface UseProductDataReturn {
  products: Product[]
  blocks: Record<string, ProductBlock[]>
  productsLoading: boolean
  blocksLoading: boolean
  productsError: string
  reloadProducts: () => Promise<void>
}

export function useProductData(): UseProductDataReturn {
  const { currentSite } = useSiteContext()
  const [products, setProducts] = useState<Product[]>([])
  const [productsLoading, setProductsLoading] = useState(true)
  const [productsError, setProductsError] = useState("")
  const [blocks, setBlocks] = useState<Record<string, ProductBlock[]>>({})
  const [blocksLoading, setBlocksLoading] = useState(false)

  const loadProducts = async () => {
    if (!currentSite?.id) {
      setProductsLoading(false)
      setProducts([])
      setBlocks({})
      return
    }
    
    setProductsLoading(true)
    setProductsError("")
    
    const result = await getSiteProductsAction(currentSite.id)
    if (result.data) {
      setProducts(result.data)
      
      // Load blocks for each product
      const allBlocks: Record<string, ProductBlock[]> = {}
      
      // Load blocks for each product
      for (const product of result.data) {
        const blocksResult = await getProductBlocksAction(product.id)
        if (blocksResult.success && blocksResult.blocks) {
          // The blocks action returns blocks keyed by product identifier
          // We want them keyed by product slug for the UI
          const productBlocks = Object.values(blocksResult.blocks).flat()
          allBlocks[product.slug] = productBlocks
        } else {
          // Initialize empty blocks if loading fails
          allBlocks[product.slug] = []
        }
      }
      
      setBlocks(allBlocks)
    } else {
      setProductsError(result.error || 'Failed to load products')
    }
    
    setProductsLoading(false)
  }

  const reloadProducts = async () => {
    await loadProducts()
  }

  useEffect(() => {
    loadProducts()
  }, [currentSite?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    products,
    blocks,
    productsLoading,
    blocksLoading,
    productsError,
    reloadProducts
  }
}