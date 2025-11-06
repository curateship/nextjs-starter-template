import { TaxonomyDefaultBlock } from "@/components/admin/taxonomy-builder/blocks/TaxonomyDefaultBlock"
import { TaxonomyPreview } from "./TaxonomyPreview"

interface TaxonomyBlock {
  id: string
  type: string
  title: string
  content: Record<string, any>
}

interface BlockPropertiesPanelProps {
  selectedBlock: TaxonomyBlock | null
  updateBlockContent: (field: string, value: any) => void
  siteId: string
  currentTaxonomy?: {
    slug: string
    name: string
    blocks: TaxonomyBlock[]
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
  onOpenTaxonomySettings?: () => void
  onTitleChange?: (title: string) => void
  onDescriptionChange?: (description: string) => void
  onFeaturedImageChange?: (featuredImage: string) => void
  onStatusChange?: (status: string) => void
}

export function BlockPropertiesPanel({
  selectedBlock,
  updateBlockContent,
  siteId,
  currentTaxonomy,
  site,
  siteBlocks,
  blocksLoading = false,
  onOpenTaxonomySettings,
  onTitleChange,
  onDescriptionChange,
  onFeaturedImageChange,
  onStatusChange
}: BlockPropertiesPanelProps) {
  // Get navigation and footer from siteBlocks for the current taxonomy
  const currentSiteBlocks = siteBlocks?.[currentTaxonomy?.slug || ''] || []
  const navigation = currentSiteBlocks.find(b => b.type === 'navigation')?.content
  const footer = currentSiteBlocks.find(b => b.type === 'footer')?.content

  return (
    <div className="flex-1 border-r bg-muted/30 overflow-y-auto pb-10">
      {selectedBlock ? (
        <div>
          <div className="space-y-4">
            {selectedBlock.type === 'taxonomy-default' && (
              <TaxonomyDefaultBlock
                title={currentTaxonomy?.title || currentTaxonomy?.name || ''}
                richText={currentTaxonomy?.description || ''}
                featuredImage={currentTaxonomy?.featured_image || ''}
                status={currentTaxonomy?.is_published ? 'published' : 'draft'}
                onTitleChange={onTitleChange}
                onRichTextChange={onDescriptionChange}
                onFeaturedImageChange={onFeaturedImageChange}
                onStatusChange={onStatusChange}
                onOpenSettings={onOpenTaxonomySettings}
              />
            )}
          </div>
        </div>
      ) : (
        <div className="h-full">
          <TaxonomyPreview
            blocks={currentTaxonomy?.blocks || []}
            taxonomy={currentTaxonomy ? {
              id: currentTaxonomy.id || 'preview',
              title: currentTaxonomy.title || currentTaxonomy.name,
              slug: currentTaxonomy.slug,
              meta_description: currentTaxonomy.meta_description,
              site_id: currentTaxonomy.site_id || siteId,
              featured_image: currentTaxonomy.featured_image || null,
              description: currentTaxonomy.description || null,
              is_published: currentTaxonomy.is_published || false
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
          />
        </div>
      )}
    </div>
  )
}
