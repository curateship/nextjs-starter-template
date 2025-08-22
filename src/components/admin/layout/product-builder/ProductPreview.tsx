"use client"

import { ProductBlockRenderer } from "@/components/frontend/layout/products/product-block-renderer"
import { createPreviewSite } from "@/lib/utils/admin-to-frontend-blocks"
import type { ProductWithBlocks } from "@/lib/actions/product-frontend-actions"
import type { Block } from "@/lib/actions/page-blocks-actions"

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
  featured_image?: string | null
  description?: string | null
  is_published?: boolean
}

interface ProductPreviewProps {
  blocks: ProductBlock[]
  product?: Product
  site?: {
    id: string
    name: string
    subdomain: string
  }
  allBlocks?: Record<string, Block[]>
  className?: string
  blocksLoading?: boolean
}

export function ProductPreview({ blocks, product, site, allBlocks, className = "", blocksLoading = false }: ProductPreviewProps) {
  // Convert product blocks to Block format for compatibility with createPreviewSite
  const productBlocks: Block[] = blocks.map(block => ({
    id: block.id,
    type: block.type,
    title: block.title,
    content: block.content,
    display_order: 0 // Will be handled by block ordering
  }))

  // Combine product blocks with navigation and footer from allBlocks (same as PagePreview)
  let allPreviewBlocks = [...productBlocks]
  
  if (allBlocks) {
    // Find navigation and footer blocks from all pages (same logic as PagePreview)
    const navigationBlock = Object.values(allBlocks).flat().find(block => block.type === 'navigation')
    const footerBlock = Object.values(allBlocks).flat().find(block => block.type === 'footer')
    
    // Add navigation and footer if they exist and aren't already in the product blocks
    if (navigationBlock && !productBlocks.some(b => b.type === 'navigation')) {
      allPreviewBlocks.unshift(navigationBlock)
    }
    if (footerBlock && !productBlocks.some(b => b.type === 'footer')) {
      allPreviewBlocks.push(footerBlock)
    }
  }
  
  // Transform admin blocks to frontend format using the same utility as PagePreview
  const previewSite = createPreviewSite(allPreviewBlocks, site)

  // Create mock product data
  const previewProduct: ProductWithBlocks = {
    id: product?.id || 'preview',
    title: product?.title || 'Preview Product',
    slug: product?.slug || 'preview',
    is_published: product?.is_published || true,
    featured_image: product?.featured_image || null,
    description: product?.description || null,
    blocks: productBlocks.map(block => ({
      id: block.id,
      type: block.type,
      content: block.content,
      display_order: block.display_order
    }))
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
          {blocksLoading ? (
            // Preview skeleton loading state
            <div className="space-y-6 p-6">
              {/* Header skeleton */}
              <div className="space-y-4">
                <div className="h-8 bg-gray-200 rounded animate-pulse w-3/4"></div>
                <div className="h-4 bg-gray-100 rounded animate-pulse w-1/2"></div>
              </div>
              
              {/* Content blocks skeleton */}
              {[1, 2, 3].map((i) => (
                <div key={i} className="border rounded-lg p-6 space-y-4">
                  <div className="h-6 bg-gray-200 rounded animate-pulse w-1/3"></div>
                  <div className="space-y-2">
                    <div className="h-4 bg-gray-100 rounded animate-pulse"></div>
                    <div className="h-4 bg-gray-100 rounded animate-pulse w-4/5"></div>
                    <div className="h-4 bg-gray-100 rounded animate-pulse w-3/5"></div>
                  </div>
                  <div className="h-32 bg-gray-100 rounded animate-pulse"></div>
                </div>
              ))}
            </div>
          ) : blocks.length === 0 ? (
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