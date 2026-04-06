import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { DirectoryContentBlock } from "@/components/admin/directory-builder/blocks/DirectoryContentBlock"
import { DirectoryCustomBlock } from "@/components/admin/directory-builder/blocks/DirectoryCustomBlock"
import { DirectoryPreview } from "./DirectoryPreview"
import type { DirectoryCustomBlockTemplate } from "@/lib/actions/directories/directory-custom-blocks/types"

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
  customBlockTemplates?: DirectoryCustomBlockTemplate[]
  blocksLoading?: boolean
  onTitleChange?: (title: string) => void
  onSelectBlock?: (block: any) => void
  onBack?: () => void
  showDirectoryTitleField?: boolean
}

export function BlockPropertiesPanel({
  selectedBlock,
  updateBlockContent,
  siteId,
  currentDirectory,
  site,
  siteBlocks,
  customBlockTemplates = [],
  blocksLoading = false,
  onTitleChange,
  onSelectBlock,
  onBack,
  showDirectoryTitleField = true,
}: BlockPropertiesPanelProps) {
  // Get navigation and footer from siteBlocks for the current directory
  const currentSiteBlocks = siteBlocks?.[currentDirectory?.slug || ''] || []
  const navigation = currentSiteBlocks.find(b => b.type === 'navigation')?.content ?? site?.settings?.navigation
  const footer = currentSiteBlocks.find(b => b.type === 'footer')?.content ?? site?.settings?.footer

  return (
    <div className={`flex-1 border-r bg-background builder-scroll ${selectedBlock ? 'overflow-y-auto pb-10' : 'overflow-y-auto'}`}>
      {selectedBlock ? (
        <AdminLayout>
            {selectedBlock.type === 'directory-content' && (
              <DirectoryContentBlock
                content={selectedBlock.content}
                onContentChange={updateBlockContent}
                siteId={siteId}
                blockId={selectedBlock.id}
                directoryData={{
                  title: currentDirectory?.title || currentDirectory?.name,
                  name: currentDirectory?.name,
                }}
                onDirectoryTitleChange={onTitleChange}
                onBack={onBack}
                showDirectoryTitleField={showDirectoryTitleField}
              />
            )}
            {selectedBlock.type === 'directory-custom' && (
              <DirectoryCustomBlock
                content={selectedBlock.content}
                onContentChange={updateBlockContent}
                siteId={siteId}
                template={customBlockTemplates.find(template => template.id === selectedBlock.content?.templateId) || null}
                onBack={onBack}
              />
            )}
        </AdminLayout>
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
            allBlocks={currentDirectory?.blocks || []}
            customBlockTemplates={customBlockTemplates}
            onSelectBlock={onSelectBlock}
          />
        </div>
      )}
    </div>
  )
}
