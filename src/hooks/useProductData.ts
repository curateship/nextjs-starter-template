import { useState, useEffect } from "react"
import { getAllProductsAction, type Product } from "@/lib/actions/product-actions"

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
  const [products, setProducts] = useState<Product[]>([])
  const [productsLoading, setProductsLoading] = useState(true)
  const [productsError, setProductsError] = useState("")
  const [blocks, setBlocks] = useState<Record<string, ProductBlock[]>>({})
  const [blocksLoading, setBlocksLoading] = useState(false)

  const loadProducts = async () => {
    setProductsLoading(true)
    setProductsError("")
    
    const result = await getAllProductsAction()
    if (result.data) {
      setProducts(result.data)
      
      // Initialize empty blocks for each product (no server calls initially)
      const initialBlocks: Record<string, ProductBlock[]> = {}
      result.data.forEach(product => {
        initialBlocks[product.slug] = []
      })
      setBlocks(initialBlocks)
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
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    products,
    blocks,
    productsLoading,
    blocksLoading,
    productsError,
    reloadProducts
  }
}