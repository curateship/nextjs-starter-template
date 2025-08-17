"use client"

import { ProductBlockRenderer } from "@/components/frontend/layout/products/product-block-renderer"
import type { ProductWithBlocks } from "@/lib/actions/product-frontend-actions"
import type { SiteWithBlocks } from "@/lib/actions/frontend-actions"

interface ProductBlock {
  id: string
  type: string
  title: string
  content: Record<string, any>
}

interface Product {
  id: string
  title: string
  slug: string
  meta_description?: string
  site_id: string
}

interface ProductPreviewProps {
  blocks: ProductBlock[]
  product?: Product
  site?: {
    id: string
    name: string
    subdomain: string
  }
  siteBlocks?: {
    navigation?: any
    footer?: any
  } | null
  className?: string
}

export function ProductPreview({ blocks, product, site, siteBlocks, className = "" }: ProductPreviewProps) {
  // Transform admin blocks to frontend format
  const transformedBlocks = blocks.map(block => ({
    id: block.id,
    type: block.type,
    content: block.content,
    display_order: 0 // Will be handled by block ordering
  }))

  // Create mock product data
  const previewProduct: ProductWithBlocks = {
    id: product?.id || 'preview',
    title: product?.title || 'Preview Product',
    slug: product?.slug || 'preview',
    meta_description: product?.meta_description || 'Product preview',
    site_id: product?.site_id || site?.id || 'preview',
    blocks: transformedBlocks
  }

  // Create site data with unified block structure
  const siteBlocksArray = []
  
  // Only render navigation/footer if we have loaded site blocks
  if (siteBlocks) {
    if (siteBlocks.navigation) {
      siteBlocksArray.push({
        id: 'nav-preview',
        type: 'navigation',
        content: siteBlocks.navigation,
        display_order: 1
      })
    }
    
    if (siteBlocks.footer) {
      siteBlocksArray.push({
        id: 'footer-preview',
        type: 'footer',
        content: siteBlocks.footer,
        display_order: 100
      })
    }
  }

  const previewSite: SiteWithBlocks = {
    id: site?.id || 'preview',
    name: site?.name || 'Preview Site',
    subdomain: site?.subdomain || 'preview',
    custom_domain: null,
    theme_id: 'default',
    theme_name: 'Default Theme',
    settings: {},
    blocks: siteBlocksArray
  }
  
  return (
    <div className={`overflow-x-hidden ${className}`}>
      <div 
        style={{
          zoom: 0.8,
          width: '100%',
          contain: 'layout style', // Create new containing block
          position: 'relative',
        }}
      >
        <div className="bg-background">
          {blocks.length === 0 ? (
            <div className="flex items-center justify-center min-h-[400px] text-muted-foreground">
              <div className="text-center">
                <div className="text-lg font-medium mb-2">No blocks added yet</div>
                <div className="text-sm">Add blocks to see your product preview</div>
              </div>
            </div>
          ) : (
            <ProductBlockRenderer site={previewSite} product={previewProduct} />
          )}
        </div>
      </div>
    </div>
  )
}