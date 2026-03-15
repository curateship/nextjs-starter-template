import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PageHeroBlock } from "../blocks/hero/PageHeroBlock"
import { PageNavigationBlock } from "../blocks/navigation/PageNavigationBlock"
import { PageFooterBlock } from "../blocks/footer/PageFooterBlock"
import { PageRichTextEditorBlock } from "../blocks/rich-text-editor/PageRichTextEditorBlock"
import { PageFaqBlock } from "../blocks/faq/PageFaqBlock"
import { PageListingViewBlock } from "../blocks/listing-view/PageListingViewBlock"
import { PageDividerBlock } from "../blocks/divider/PageDividerBlock"
import { PageAuthBlock } from "../blocks/auth/PageAuthBlock"
import { PageEmbeddedBlock } from "../blocks/embedded/PageEmbeddedBlock"
import { PageTestimonialsBlock } from "../blocks/testimonials/PageTestimonialsBlock"
import { PagePreview } from "./PagePreview"
import type { PageBlock } from "@/lib/utils/page-block-utils"

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
  blocksLoading?: boolean
  onBack?: () => void
  onSelectBlock?: (block: PageBlock) => void
}

export function BlockPropertiesPanel({
  selectedBlock,
  updateBlockContent,
  siteId,
  currentPage,
  site,
  blocksLoading = false,
  onBack,
  onSelectBlock
}: BlockPropertiesPanelProps) {
  return (
    <div className={`flex-1 border-r bg-background ${selectedBlock ? 'overflow-y-auto pb-10' : 'overflow-hidden'}`}>
      {selectedBlock ? (
        <AdminLayout>
            {selectedBlock.type === 'hero' && (
              <PageHeroBlock
                content={selectedBlock.content}
                onContentChange={updateBlockContent}
                siteId={siteId}
                blockId={selectedBlock.id}
                onBack={onBack}
              />
            )}
            {selectedBlock.type === 'navigation' && (
              <PageNavigationBlock
                content={selectedBlock.content}
                onContentChange={updateBlockContent}
                siteId={siteId}
                blockId={selectedBlock.id}
                siteFavicon={site?.settings?.favicon}
                onBack={onBack}
              />
            )}
            {selectedBlock.type === 'footer' && (
              <PageFooterBlock
                {...selectedBlock.content}
                {...(createCallbacks(updateBlockContent, ['logo', 'logoUrl', 'copyright', 'links', 'socialLinks', 'style', 'visibility']) as any)}
                siteId={siteId}
                blockId={selectedBlock.id}
                siteFavicon={site?.settings?.favicon}
                onBack={onBack}
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
                  hideEditorHeader: selectedBlock.content.hideEditorHeader,
                  visibility: selectedBlock.content.visibility,
                }}
                onContentChange={(contentObj) => {
                  updateBlockContent('title', contentObj.title)
                  updateBlockContent('subtitle', contentObj.subtitle)
                  updateBlockContent('headerAlign', contentObj.headerAlign)
                  updateBlockContent('content', contentObj.content)
                }}
                onVisibilityChange={(value) => updateBlockContent('visibility', value)}
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
                visibility={selectedBlock.content.visibility}
                onVisibilityChange={(value) => updateBlockContent('visibility', value)}
                onBack={onBack}
              />
            )}
            {selectedBlock.type === 'listing-views' && (
              <PageListingViewBlock
                {...selectedBlock.content}
                {...(createCallbacks(updateBlockContent, [
                  'title', 'subtitle', 'headerAlign', 'mobileHeaderAlign', 'contentType', 'displayMode',
                  'itemsToShow', 'columns', 'sortBy', 'sortOrder', 'showImage',
                  'showTitle', 'showDescription', 'isPaginated', 'itemsPerPage',
                  'showViewAll', 'viewAllText', 'viewAllLink', 'visibility'
                ]) as any)}
                onBack={onBack}
              />
            )}
            
            {selectedBlock.type === 'divider' && (
              <PageDividerBlock
                {...selectedBlock.content}
                {...(createCallbacks(updateBlockContent, [
                  'spacingTop', 'spacingBottom', 'dividerStyle',
                  'lineStyle', 'lineWidth', 'lineThickness', 'lineColor', 'icon', 'containerWidth', 'customWidth'
                ]) as any)}
                onBack={onBack}
              />
            )}

            {selectedBlock.type === 'auth' && (
              <PageAuthBlock
                {...selectedBlock.content}
                {...(createCallbacks(updateBlockContent, [
                  'defaultTab', 'showLoginTab', 'showRegisterTab',
                  'loginRedirectPath', 'registerRedirectPath', 'emailVerificationEnabled',
                  'loginButtonText', 'registerButtonText', 'resetButtonText',
                  'loginTitle', 'loginDescription',
                  'registerTitle', 'registerDescription',
                  'resetTitle', 'resetDescription'
                ]) as any)}
                onBack={onBack}
              />
            )}

            {selectedBlock.type === 'testimonials' && (
              <PageTestimonialsBlock
                content={selectedBlock.content}
                onContentChange={updateBlockContent}
                siteId={siteId}
                blockId={selectedBlock.id}
                onBack={onBack}
              />
            )}

            {selectedBlock.type === 'embedded' && (
              <PageEmbeddedBlock
                {...selectedBlock.content}
                {...(createCallbacks(updateBlockContent, [
                  'code', 'type', 'visibility'
                ]) as any)}
                onBack={onBack}
              />
            )}
        </AdminLayout>
      ) : (
        <div className="h-full">
          {currentPage ? (
            <PagePreview
              blocks={currentPage.blocks}
              site={site}
              className="h-full"
              blocksLoading={blocksLoading}
              allBlocks={currentPage.blocks}
              onSelectBlock={onSelectBlock}
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