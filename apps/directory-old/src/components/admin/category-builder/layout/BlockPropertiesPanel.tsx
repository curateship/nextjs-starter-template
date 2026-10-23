import { ScrollArea } from "@/components/ui/scroll-area"
import { CategoryPreview } from "./CategoryPreview"

interface CategoryBlock {
  id: string
  type: string
  title: string
  content: Record<string, any>
}

interface BlockPropertiesPanelProps {
  siteId: string
  currentCategory?: {
    slug: string
    name: string
    blocks: CategoryBlock[]
    id?: string
    title?: string
    meta_description?: string
    site_id?: string
    featured_image?: string | null
    is_published?: boolean
    parent_id?: string | null
    updated_at?: string
  }
  site?: {
    id: string
    name: string
    subdomain: string
    settings?: {
      navigation?: any
      footer?: any
      favicon?: string
    }
  }
  blocksLoading?: boolean
  onSelectBlock?: (block: any) => void
}

export function BlockPropertiesPanel({
  siteId,
  currentCategory,
  site,
  blocksLoading = false,
  onSelectBlock,
}: BlockPropertiesPanelProps) {
  return (
    <div className="flex-1 overflow-hidden border-r bg-background">
      <ScrollArea className="h-full">
        <div className="min-h-full">
          <CategoryPreview
            blocks={currentCategory?.blocks || []}
            category={currentCategory ? {
              id: currentCategory.id || 'preview',
              title: currentCategory.title || currentCategory.name,
              slug: currentCategory.slug,
              meta_description: currentCategory.meta_description,
              site_id: currentCategory.site_id || siteId,
              featured_image: currentCategory.featured_image || null,
              is_published: currentCategory.is_published || false,
              parent_id: currentCategory.parent_id || null,
              updated_at: currentCategory.updated_at
            } : undefined}
            site={site ? {
              ...site,
              settings: site.settings
            } : undefined}
            className="min-h-full"
            blocksLoading={blocksLoading}
            allBlocks={currentCategory?.blocks || []}
            onSelectBlock={onSelectBlock}
          />
        </div>
      </ScrollArea>
    </div>
  )
}
