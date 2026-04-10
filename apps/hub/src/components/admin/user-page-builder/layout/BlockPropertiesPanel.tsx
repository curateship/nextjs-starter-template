import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { UserPageNavigationBlock } from "../blocks/UserPageNavigationBlock"
import { UserPageFooterBlock } from "../blocks/UserPageFooterBlock"
import { UserProfileEditorBlock } from "../blocks/UserProfileEditorBlock"
import { ScrollArea } from "@/components/ui/scroll-area"
import { PagePreview } from "../../page-builder/layout/PagePreview"
import type { ContentBlock as PageBlock } from "@/lib/utils/block-utils"

// Helper function to generate callback props dynamically
const createCallbacks = (updateFn: (field: string, value: any) => void, fields: string[]) => {
  const callbacks: Record<string, (value: any) => void> = {}
  fields.forEach(field => {
    const callbackName = `on${field.charAt(0).toUpperCase() + field.slice(1)}Change`
    callbacks[callbackName] = (value: any) => updateFn(field, value)
  })
  return callbacks
}

interface BlockPropertiesPanelProps {
  selectedBlock: PageBlock | null
  updateBlockContent: (field: string, value: any) => void
  siteId: string
  currentPage?: {
    slug: string
    name: string
    blocks: PageBlock[]
  }
  site?: {
    id: string
    name: string
    subdomain: string
    settings?: {
      favicon?: string
      [key: string]: any
    }
  }
  // allBlocks removed - navigation/footer now come from site.settings
  blocksLoading?: boolean
}

export function BlockPropertiesPanel({
  selectedBlock,
  updateBlockContent,
  siteId,
  currentPage,
  site,
  blocksLoading = false
}: BlockPropertiesPanelProps) {
  return (
    <div className="flex-1 overflow-hidden border-r bg-background">
      <ScrollArea className="h-full">
      {selectedBlock ? (
        <div className="pb-10">
        <AdminLayout>
            {selectedBlock.type === 'navigation' && (
              <UserPageNavigationBlock
                {...selectedBlock.content}
                {...(createCallbacks(updateBlockContent, ['logo', 'logoUrl', 'links', 'buttons', 'style']) as any)}
                siteId={siteId}
                blockId={selectedBlock.id}
                siteFavicon={site?.settings?.favicon}
              />
            )}
            {selectedBlock.type === 'footer' && (
              <UserPageFooterBlock
                {...selectedBlock.content}
                {...(createCallbacks(updateBlockContent, ['logo', 'logoUrl', 'copyright', 'links', 'socialLinks', 'style']) as any)}
                siteId={siteId}
                blockId={selectedBlock.id}
                siteFavicon={site?.settings?.favicon}
              />
            )}
            {selectedBlock.type === 'user-profile' && (
              <UserProfileEditorBlock
                {...selectedBlock.content}
                {...(createCallbacks(updateBlockContent, [
                  'title', 'showAvatar', 'showEmail', 'showName', 'allowEdit'
                ]) as any)}
              />
            )}
        </AdminLayout>
        </div>
      ) : (
        <div className="min-h-full">
          {currentPage ? (
            <PagePreview 
              blocks={currentPage.blocks} 
              site={site}
              className="min-h-full"
              blocksLoading={blocksLoading}
            />
          ) : (
            <div className="text-center text-muted-foreground h-full flex items-center justify-center">
              <div>
                <p className="text-lg font-medium mb-2">No blocks added yet</p>
                <p className="text-sm">Add blocks to see your page preview</p>
              </div>
            </div>
          )}
        </div>
      )}
      </ScrollArea>
    </div>
  )
}
