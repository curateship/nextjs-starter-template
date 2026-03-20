import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { CategoryContentBlock } from "@/components/admin/category-builder/blocks/CategoryContentBlock"
import { CategoryPreview } from "./CategoryPreview"

interface CategoryBlock {
  id: string
  type: string
  title: string
  content: Record<string, any>
}

interface BlockPropertiesPanelProps {
  selectedBlock: CategoryBlock | null
  updateBlockContent: (field: string, value: any) => void
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
    description?: string | null
    is_published?: boolean
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
  siteBlocks?: Record<string, any[]>
  blocksLoading?: boolean
  onTitleChange?: (title: string) => void
  onSelectBlock?: (block: any) => void
  onBack?: () => void
}

export function BlockPropertiesPanel({
  selectedBlock,
  updateBlockContent,
  siteId,
  currentCategory,
  site,
  siteBlocks,
  blocksLoading = false,
  onTitleChange,
  onSelectBlock,
  onBack,
}: BlockPropertiesPanelProps) {
  const currentSiteBlocks = siteBlocks?.[currentCategory?.slug || ''] || []
  const navigation = currentSiteBlocks.find(b => b.type === 'navigation')?.content
  const footer = currentSiteBlocks.find(b => b.type === 'footer')?.content

  return (
    <div className={`flex-1 border-r bg-background builder-scroll ${selectedBlock ? 'overflow-y-auto pb-10' : 'overflow-y-auto'}`}>
      {selectedBlock ? (
        <AdminLayout>
            {selectedBlock.type === 'taxonomy-content' && (
              <CategoryContentBlock
                content={selectedBlock.content}
                onContentChange={updateBlockContent}
                siteId={siteId}
                blockId={selectedBlock.id}
                categoryData={{
                  title: currentCategory?.title || currentCategory?.name,
                  name: currentCategory?.name,
                }}
                onCategoryTitleChange={onTitleChange}
                onBack={onBack}
              />
            )}
        </AdminLayout>
      ) : (
        <div className="h-full">
          <CategoryPreview
            blocks={currentCategory?.blocks || []}
            category={currentCategory ? {
              id: currentCategory.id || 'preview',
              title: currentCategory.title || currentCategory.name,
              slug: currentCategory.slug,
              meta_description: currentCategory.meta_description,
              site_id: currentCategory.site_id || siteId,
              featured_image: currentCategory.featured_image || null,
              description: currentCategory.description || null,
              is_published: currentCategory.is_published || false
            } : undefined}
            site={site ? {
              ...site,
              settings: {
                ...site.settings,
                navigation,
                footer
              }
            } : undefined}
            className="h-full"
            blocksLoading={blocksLoading}
            allBlocks={currentCategory?.blocks || []}
            onSelectBlock={onSelectBlock}
          />
        </div>
      )}
    </div>
  )
}
