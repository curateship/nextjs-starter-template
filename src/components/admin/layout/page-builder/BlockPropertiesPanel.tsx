import { HeroRuixenBlock } from "./HeroRuixenBlock"
import { NavigationBlock } from "./NavigationBlock"
import { FooterBlock } from "./FooterBlock"
import { RichTextBlock } from "@/components/admin/modules/shared-blocks/RichTextBlock"
import { PagePreview } from "./PagePreview"
import type { Block } from "@/lib/actions/page-blocks-actions"

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
  selectedBlock: Block | null
  updateBlockContent: (field: string, value: any) => void
  siteId: string
  currentPage?: {
    slug: string
    name: string
    blocks: Block[]
  }
  site?: {
    id: string
    name: string
    subdomain: string
  }
}

export function BlockPropertiesPanel({
  selectedBlock,
  updateBlockContent,
  siteId,
  currentPage,
  site
}: BlockPropertiesPanelProps) {
  return (
    <div className="flex-1 border-r bg-muted/30 p-4 overflow-y-auto">
      {selectedBlock ? (
        <div>
          <div className="space-y-4">
            {selectedBlock.type === 'hero' && (
              <HeroRuixenBlock
                {...selectedBlock.content}
                {...createCallbacks(updateBlockContent, [
                  'title', 'subtitle', 'primaryButton', 'secondaryButton', 
                  'primaryButtonLink', 'secondaryButtonLink', 'primaryButtonStyle', 'secondaryButtonStyle',
                  'backgroundColor', 'showRainbowButton', 'rainbowButtonText', 'rainbowButtonIcon',
                  'githubLink', 'showParticles', 'trustedByText', 'trustedByTextColor', 
                  'trustedByCount', 'trustedByAvatars', 'backgroundPattern', 'backgroundPatternSize',
                  'backgroundPatternOpacity', 'backgroundPatternColor'
                ])}
                siteId={siteId}
                blockId={selectedBlock.id}
              />
            )}
            {selectedBlock.type === 'navigation' && (
              <NavigationBlock
                {...selectedBlock.content}
                {...createCallbacks(updateBlockContent, ['logo', 'links', 'buttons', 'style'])}
                siteId={siteId}
                blockId={selectedBlock.id}
              />
            )}
            {selectedBlock.type === 'footer' && (
              <FooterBlock
                {...selectedBlock.content}
                {...createCallbacks(updateBlockContent, ['logo', 'copyright', 'links', 'socialLinks', 'style'])}
                siteId={siteId}
                blockId={selectedBlock.id}
              />
            )}
            {selectedBlock.type === 'rich-text' && (
              <RichTextBlock
                content={selectedBlock.content}
                onContentChange={(contentObj) => {
                  updateBlockContent('title', contentObj.title)
                  updateBlockContent('subtitle', contentObj.subtitle)
                  updateBlockContent('headerAlign', contentObj.headerAlign)
                  updateBlockContent('content', contentObj.content)
                }}
              />
            )}
          </div>
        </div>
      ) : (
        <div className="h-full">
          {currentPage && currentPage.blocks.length > 0 ? (
            <PagePreview 
              blocks={currentPage.blocks} 
              site={site}
              className="h-full"
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
    </div>
  )
}