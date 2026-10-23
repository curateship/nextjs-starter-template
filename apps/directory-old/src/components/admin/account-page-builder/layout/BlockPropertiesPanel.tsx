import { ScrollArea } from "@/components/ui/scroll-area"
import { PagePreview } from "../../page-builder/layout/PagePreview"
import type { ContentBlock as PageBlock } from "@/lib/utils/block-utils"

interface BlockPropertiesPanelProps {
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
  blocksLoading?: boolean
  selectedBlock?: PageBlock | null
  onSelectBlock?: (block: PageBlock) => void
  onSelectSiteChrome?: (type: 'navigation' | 'footer') => void
}

export function BlockPropertiesPanel({
  currentPage,
  site,
  blocksLoading = false,
  selectedBlock,
  onSelectBlock,
  onSelectSiteChrome
}: BlockPropertiesPanelProps) {
  return (
    <div className="flex-1 overflow-hidden border-r bg-background">
      <ScrollArea className="h-full">
        <div className="min-h-full">
          {currentPage ? (
            <PagePreview
              blocks={currentPage.blocks}
              site={site}
              className="min-h-full"
              blocksLoading={blocksLoading}
              allBlocks={currentPage.blocks}
              selectedBlock={selectedBlock}
              onSelectBlock={onSelectBlock}
              onSelectSiteChrome={onSelectSiteChrome}
              renderAccountBlocks
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
      </ScrollArea>
    </div>
  )
}
