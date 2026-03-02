"use client"

import { createPreviewSite, type PreviewBlock } from "@/lib/utils/admin-builder-preview"
import { CategoryBlockRenderer } from "@/components/frontend/categories/CategoryBlockRenderer"
import { getFontByValue, getFontFamily, defaultFont } from "@/lib/utils/font-config"

interface CategoryBlock {
  id: string
  type: string
  title: string
  content: Record<string, any>
}

interface CategoryData {
  id: string
  title: string
  slug: string
  meta_description?: string
  site_id: string
  featured_image?: string | null
  description?: string | null
  is_published?: boolean
}

interface CategoryPreviewProps {
  blocks: CategoryBlock[]
  category?: CategoryData
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
}

export function CategoryPreview({ blocks, category, site, className = "", blocksLoading = false }: CategoryPreviewProps) {
  const previewBlocks: PreviewBlock[] = blocks.map((block, index) => ({
    id: block.id,
    type: block.type,
    content: block.content,
    display_order: index
  }))

  const previewSite = createPreviewSite(previewBlocks, site)

  const previewCategory = {
    id: category?.id || 'preview',
    title: category?.title || 'Preview Category',
    slug: category?.slug || 'preview',
    description: category?.description || null,
    featured_image: category?.featured_image || null,
    blocks: previewBlocks.map(block => ({
      id: block.id,
      type: block.type,
      content: block.content,
      display_order: block.display_order || 0
    }))
  }

  const fontFamily = site?.settings?.font_family || 'playfair-display'
  const secondaryFontFamily = site?.settings?.secondary_font_family || 'urbanist'

  const primary = getFontByValue(fontFamily) ?? defaultFont
  const secondary = getFontByValue(secondaryFontFamily) ?? primary
  const primaryFontFamilyValue = getFontFamily(primary.value)
  const secondaryFontFamilyValue = getFontFamily(secondary.value)

  return (
    <div
      className={`overflow-x-hidden ${className} preview-container`}
      style={{
        ['--font-primary' as string]: primaryFontFamilyValue,
        ['--font-secondary' as string]: secondaryFontFamilyValue,
      }}
    >
      <div
        style={{
          zoom: 0.8,
          width: '100%',
          contain: 'layout style',
          position: 'relative',
        }}
      >
        <div className="bg-background">
          {blocksLoading ? (
            <div className="space-y-6 p-6">
              <div className="space-y-4">
                <div className="h-8 bg-muted rounded animate-pulse w-3/4"></div>
                <div className="h-4 bg-muted/60 rounded animate-pulse w-1/2"></div>
              </div>
              {[1, 2, 3].map((i) => (
                <div key={i} className="border rounded-lg p-6 space-y-4">
                  <div className="h-6 bg-muted rounded animate-pulse w-1/3"></div>
                  <div className="space-y-2">
                    <div className="h-4 bg-muted/60 rounded animate-pulse"></div>
                    <div className="h-4 bg-muted/60 rounded animate-pulse w-4/5"></div>
                    <div className="h-4 bg-muted/60 rounded animate-pulse w-3/5"></div>
                  </div>
                  <div className="h-32 bg-muted/60 rounded animate-pulse"></div>
                </div>
              ))}
            </div>
          ) : blocks.length === 0 ? (
            <div className="flex items-center justify-center min-h-[400px] text-muted-foreground">
              <div className="text-center">
                <div className="text-lg font-medium mb-2">No blocks added yet</div>
                <div className="text-sm">Add blocks to see your category preview</div>
              </div>
            </div>
          ) : (
            <CategoryBlockRenderer site={previewSite} category={previewCategory} />
          )}
        </div>
      </div>
    </div>
  )
}
