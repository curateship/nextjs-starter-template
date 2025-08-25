import { PageHeroBlock } from "./blocks/PageHeroBlock"
import { PageNavigationBlock } from "./blocks/PageNavigationBlock"
import { PageFooterBlock } from "./blocks/PageFooterBlock"
import { PageRichTextEditorBlock } from "./blocks/PageRichTextEditorBlock"
import { PageFaqBlock } from "./blocks/PageFaqBlock"
import { PageListingViewBlock } from "./blocks/PageListingViewBlock"
import { PageDividerBlock } from "./blocks/PageDividerBlock"
import { PagePreview } from "./PagePreview"
import type { Block } from "@/lib/utils/block-types"

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
    settings?: {
      favicon?: string
      [key: string]: any
    }
  }
  allBlocks?: Record<string, Block[]>
  blocksLoading?: boolean
}

export function BlockPropertiesPanel({
  selectedBlock,
  updateBlockContent,
  siteId,
  currentPage,
  site,
  allBlocks,
  blocksLoading = false
}: BlockPropertiesPanelProps) {
  return (
    <div className="flex-1 border-r bg-muted/30 p-4 overflow-y-auto">
      {selectedBlock ? (
        <div>
          <div className="space-y-4">
            {selectedBlock.type === 'hero' && (
              <PageHeroBlock
                {...selectedBlock.content}
                {...(createCallbacks(updateBlockContent, [
                  'title', 'subtitle', 'primaryButton', 'secondaryButton', 
                  'primaryButtonLink', 'secondaryButtonLink', 'primaryButtonStyle', 'secondaryButtonStyle',
                  'backgroundColor', 'showRainbowButton', 'rainbowButtonText', 'rainbowButtonIcon',
                  'githubLink', 'showParticles', 'trustedByText', 'trustedByTextColor', 
                  'trustedByCount', 'trustedByAvatars', 'backgroundPattern', 'backgroundPatternSize',
                  'backgroundPatternOpacity', 'backgroundPatternColor', 'heroImage', 'showHeroImage', 'showTrustedByBadge'
                ]) as any)}
                siteId={siteId}
                blockId={selectedBlock.id}
              />
            )}
            {selectedBlock.type === 'navigation' && (
              <PageNavigationBlock
                {...selectedBlock.content}
                {...(createCallbacks(updateBlockContent, ['logo', 'logoUrl', 'links', 'buttons', 'style']) as any)}
                siteId={siteId}
                blockId={selectedBlock.id}
                siteFavicon={site?.settings?.favicon}
              />
            )}
            {selectedBlock.type === 'footer' && (
              <PageFooterBlock
                {...selectedBlock.content}
                {...(createCallbacks(updateBlockContent, ['logo', 'logoUrl', 'copyright', 'links', 'socialLinks', 'style']) as any)}
                siteId={siteId}
                blockId={selectedBlock.id}
              />
            )}
            {selectedBlock.type === 'rich-text' && (
              <PageRichTextEditorBlock
                content={{
                  title: selectedBlock.content.title || '',
                  subtitle: selectedBlock.content.subtitle || '',
                  headerAlign: selectedBlock.content.headerAlign || 'left',
                  content: selectedBlock.content.content || '',
                  hideHeader: selectedBlock.content.hideHeader,
                  hideEditorHeader: selectedBlock.content.hideEditorHeader
                }}
                onContentChange={(contentObj) => {
                  updateBlockContent('title', contentObj.title)
                  updateBlockContent('subtitle', contentObj.subtitle)
                  updateBlockContent('headerAlign', contentObj.headerAlign)
                  updateBlockContent('content', contentObj.content)
                }}
              />
            )}
            {selectedBlock.type === 'faq' && (
              <PageFaqBlock
                title={selectedBlock.content.title ?? ''}
                subtitle={selectedBlock.content.subtitle ?? ''}
                headerAlign={selectedBlock.content.headerAlign ?? 'left'}
                faqItems={selectedBlock.content.faqItems}
                onTitleChange={(value) => updateBlockContent('title', value)}
                onSubtitleChange={(value) => updateBlockContent('subtitle', value)}
                onHeaderAlignChange={(value) => updateBlockContent('headerAlign', value)}
                onFaqItemsChange={(value) => updateBlockContent('faqItems', value)}
              />
            )}
            {selectedBlock.type === 'listing-views' && (
              <PageListingViewBlock
                {...selectedBlock.content}
                {...(createCallbacks(updateBlockContent, [
                  'title', 'subtitle', 'headerAlign', 'contentType', 'displayMode',
                  'itemsToShow', 'columns', 'sortBy', 'sortOrder', 'showImage',
                  'showTitle', 'showDescription', 'isPaginated', 'itemsPerPage',
                  'showViewAll', 'viewAllText', 'viewAllLink', 'backgroundColor'
                ]) as any)}
              />
            )}
            
            {selectedBlock.type === 'divider' && (
              <PageDividerBlock
                {...selectedBlock.content}
                {...(createCallbacks(updateBlockContent, [
                  'spacingTop', 'spacingBottom', 'dividerStyle',
                  'lineStyle', 'lineWidth', 'lineThickness', 'lineColor', 'icon', 'containerWidth', 'customWidth'
                ]) as any)}
              />
            )}
          </div>
        </div>
      ) : (
        <div className="h-full">
          {currentPage ? (
            <PagePreview 
              blocks={currentPage.blocks} 
              site={site}
              allBlocks={allBlocks}
              className="h-full"
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
    </div>
  )
}