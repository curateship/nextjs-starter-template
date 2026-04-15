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
    status?: 'draft' | 'published'
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
  customBlockTemplates = [],
  blocksLoading = false,
  onTitleChange,
  onSelectBlock,
  onBack,
  showDirectoryTitleField = true,
}: BlockPropertiesPanelProps) {
  return (
    <div className="flex-1 overflow-hidden border-r bg-background">
      <div className="h-full overflow-y-auto">
      {selectedBlock ? (
        <div className="pb-10">
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
        </div>
      ) : (
        <div className="min-h-full">
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
              status: currentDirectory.status || 'draft'
            } : undefined}
            site={site ? {
              ...site,
              settings: site.settings
            } : undefined}
            className="min-h-full"
            blocksLoading={blocksLoading}
            allBlocks={currentDirectory?.blocks || []}
            customBlockTemplates={customBlockTemplates}
            onSelectBlock={onSelectBlock}
          />
        </div>
      )}
      </div>
    </div>
  )
}
