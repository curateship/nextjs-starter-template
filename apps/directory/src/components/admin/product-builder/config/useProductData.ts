import { type SiteWithTheme } from "@/lib/actions/sites/site-actions"
import { getSiteProductsAction } from "@/lib/actions/products/product-actions"
import { parseProductBlocksFromJson, type ProductBuilderBlock } from "./product-block-utils"
import { useSiteContentData } from "@/components/admin/layout/builder/useSiteContentData"

type ProductBlock = ProductBuilderBlock

interface ProductRow {
  id: string
  slug: string
  content_blocks?: Record<string, any> | null
}

// Convert product rows to editor blocks keyed by product slug
function getProductBlocksBySlug(products: ProductRow[]) {
  const convertedBlocks: Record<string, ProductBlock[]> = {}

  products.forEach((product) => {
    convertedBlocks[product.slug] = parseProductBlocksFromJson(product.content_blocks || {})
  })

  return convertedBlocks
}

// Stable reference for the generic hook's fetchItems dependency
function fetchProducts(siteId: string, options: { selectedSlug?: string }) {
  return getSiteProductsAction(siteId, options)
}

interface UseProductDataReturn {
  site: SiteWithTheme | null
  blocks: Record<string, ProductBlock[]>
  siteLoading: boolean
  blocksLoading: boolean
  siteError: string
  reloadBlocks: () => Promise<void>
}

export function useProductData(siteId: string, selectedProduct = ""): UseProductDataReturn {
  const { site, blocks, siteLoading, blocksLoading, siteError, reloadBlocks } = useSiteContentData<ProductRow, ProductBlock>({
    siteId,
    selectedSlug: selectedProduct,
    fetchItems: fetchProducts,
    itemsToBlocksBySlug: getProductBlocksBySlug,
    reloadSite: true, // matches previous behavior: reload refetched the site too
  })

  return { site, blocks, siteLoading, blocksLoading, siteError, reloadBlocks }
}
