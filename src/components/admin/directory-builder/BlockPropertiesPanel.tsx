import { DirectoryDefaultBlock } from "@/components/admin/directory-builder/blocks/DirectoryDefaultBlock"
import { DirectoryPreview } from "./DirectoryPreview"

interface DirectoryBlock {
  id: string
  type: string
  title: string
  content: Record<string, any>
}

interface BlockPropertiesPanelProps {
  selectedBlock: DirectoryBlock | null
  updateBlockContent: (field: string, value: any) => void
  siteId: string
  currentDirectory?: {
    slug: string
    name: string
    blocks: DirectoryBlock[]
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
    }
  }
  siteBlocks?: Record<string, any[]>
  blocksLoading?: boolean
  onOpenDirectorySettings?: () => void
  onTitleChange?: (title: string) => void
  onDescriptionChange?: (description: string) => void
  onFeaturedImageChange?: (featuredImage: string) => void
  onStatusChange?: (status: string) => void
}

export function BlockPropertiesPanel({
  selectedBlock,
  updateBlockContent,
  siteId,
  currentDirectory,
  site,
  siteBlocks,
  blocksLoading = false,
  onOpenDirectorySettings,
  onTitleChange,
  onDescriptionChange,
  onFeaturedImageChange,
  onStatusChange
}: BlockPropertiesPanelProps) {
  // Get navigation and footer from siteBlocks for the current directory
  const currentSiteBlocks = siteBlocks?.[currentDirectory?.slug || ''] || []
  const navigation = currentSiteBlocks.find(b => b.type === 'navigation')?.content
  const footer = currentSiteBlocks.find(b => b.type === 'footer')?.content

  return (
    <div className="flex-1 border-r bg-muted/30 overflow-y-auto">
      {selectedBlock ? (
        <div>
          <div className="space-y-4 p-4">
            {selectedBlock.type === 'directory-default' && (
              <DirectoryDefaultBlock
                title={currentDirectory?.title || currentDirectory?.name || ''}
                richText={currentDirectory?.description || ''}
                featuredImage={currentDirectory?.featured_image || ''}
                status={currentDirectory?.is_published ? 'published' : 'draft'}
                onTitleChange={onTitleChange}
                onRichTextChange={onDescriptionChange}
                onFeaturedImageChange={onFeaturedImageChange}
                onStatusChange={onStatusChange}
                onOpenSettings={onOpenDirectorySettings}
              />
            )}
          </div>
        </div>
      ) : (
        <div className="h-full">
          <DirectoryPreview
            blocks={currentDirectory?.blocks || []}
            directory={currentDirectory ? {
              id: currentDirectory.id || 'preview',
              title: currentDirectory.title || currentDirectory.name,
              slug: currentDirectory.slug,
              meta_description: currentDirectory.meta_description,
              site_id: currentDirectory.site_id || siteId,
              featured_image: currentDirectory.featured_image || null,
              description: currentDirectory.description || null,
              is_published: currentDirectory.is_published || false
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
