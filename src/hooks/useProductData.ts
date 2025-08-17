import { useState, useEffect } from "react"
import { getSiteProductsAction, type Product } from "@/lib/actions/product-actions"
import { getAllProductBlocksAction } from "@/lib/actions/product-blocks-actions"
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
  productsError: string
  reloadProducts: () => Promise<void>
}

export function useProductData(): UseProductDataReturn {
  const { currentSite } = useSiteContext()
  const [products, setProducts] = useState<Product[]>([])
  const [productsLoading, setProductsLoading] = useState(true)
  const [productsError, setProductsError] = useState("")
  const [blocks, setBlocks] = useState<Record<string, ProductBlock[]>>({})

  const loadProducts = async () => {
    if (!currentSite?.id) {
      setProductsLoading(false)
      setProducts([])
      setBlocks({})
      return
    }
    
    setProductsLoading(true)
    setProductsError("")
    
    try {
      // Load products for the product list (like pages loads site info)
      const productsResult = await getSiteProductsAction(currentSite.id)
      if (productsResult && productsResult.data) {
        setProducts(productsResult.data)
        
        // Load product blocks (exactly like pages)
        const blocksResult = await getAllProductBlocksAction(currentSite.id)
        if (blocksResult.success && blocksResult.blocks) {
          setBlocks(blocksResult.blocks)
        } else {
          console.error('Failed to load blocks:', blocksResult.error)
        }
      } else {
        setProductsError(productsResult?.error || 'Failed to load products')
      }
    } catch (error) {
      console.error('Error loading products:', error)
      setProductsError('Failed to load products')
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
    productsError,
    reloadProducts
  }
}