"use client"

import { BuilderPreviewShell } from "@/components/admin/layout/builder/BuilderPreviewShell"
import { ProductBlockRenderer } from "@/components/frontend/products/ProductBlockRenderer"
import {
  createPreviewEntityBlocks,
  createPreviewSite,
  normalizePreviewBlocks,
} from "@/lib/utils/admin-builder-preview"
import type { ProductWithBlocks } from "@/lib/actions/products/product-frontend-actions"

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
    settings?: {
      navigation?: any
      footer?: any
      font_family?: string
      secondary_font_family?: string
    }
  }
  className?: string
  blocksLoading?: boolean
  allBlocks?: ProductBlock[]
  onSelectBlock?: (block: ProductBlock) => void
}

export function ProductPreview({
  blocks,
  product,
  site,
  className = "",
  blocksLoading = false,
  allBlocks,
  onSelectBlock,
}: ProductPreviewProps) {
  const previewBlocks = normalizePreviewBlocks(blocks)
  const previewSite = createPreviewSite(previewBlocks, site)

  const previewProduct: ProductWithBlocks = {
    id: product?.id || "preview",
    title: product?.title || "Preview Product",
    slug: product?.slug || "preview",
    is_published: product?.is_published || true,
    featured_image: product?.featured_image || null,
    description: product?.description || null,
    blocks: createPreviewEntityBlocks(previewBlocks),
  }

  return (
    <BuilderPreviewShell
      allBlocks={allBlocks}
      className={className}
      emptyDescription="Add blocks to see your product preview"
      isEmpty={blocks.length === 0}
      isLoading={blocksLoading}
      onSelectBlock={onSelectBlock}
      site={site}
      showSiteChrome
    >
      <ProductBlockRenderer site={previewSite} product={previewProduct} isPreview hideSiteChrome />
    </BuilderPreviewShell>
  )
}
