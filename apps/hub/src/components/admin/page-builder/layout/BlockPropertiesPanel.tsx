import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { PageHeroBlock } from "../blocks/hero/PageHeroBlock"
import { PageRichTextEditorBlock } from "../blocks/rich-text-editor/PageRichTextEditorBlock"
import { PageFaqBlock } from "../blocks/faq/PageFaqBlock"
import { PageListingViewBlock } from "../blocks/listing-view/PageListingViewBlock"
import { PageDividerBlock } from "../blocks/divider/PageDividerBlock"
import { PageAuthBlock } from "../blocks/auth/PageAuthBlock"
import { PageEmbeddedBlock } from "../blocks/embedded/PageEmbeddedBlock"
import { PageTestimonialsBlock } from "../blocks/testimonials/PageTestimonialsBlock"
import { ScrollArea } from "@/components/ui/scroll-area"
import { PagePreview } from "./PagePreview"
import type { ContentBlock as PageBlock } from "@/lib/utils/block-utils"

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
  onSelectSiteChrome?: (type: 'navigation' | 'footer') => void
}

export function BlockPropertiesPanel({
  selectedBlock,
  updateBlockContent,
  siteId,
  currentPage,
  site,
  blocksLoading = false,
  onBack,
  onSelectBlock,
  onSelectSiteChrome
}: BlockPropertiesPanelProps) {
  return (
    <div className="flex-1 overflow-hidden border-r bg-background">
      <ScrollArea className="h-full">
      {selectedBlock ? (
        <div className="pb-10">
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
                onTitleChange={(value) => updateBlockContent('title', value)}
                onSubtitleChange={(value) => updateBlockContent('subtitle', value)}
                onHeaderAlignChange={(value) => updateBlockContent('headerAlign', value)}
                onMobileHeaderAlignChange={(value) => updateBlockContent('mobileHeaderAlign', value)}
                onContentTypeChange={(value) => updateBlockContent('contentType', value)}
                onDisplayModeChange={(value) => updateBlockContent('displayMode', value)}
                onItemsToShowChange={(value) => updateBlockContent('itemsToShow', value)}
                onColumnsChange={(value) => updateBlockContent('columns', value)}
                onSortByChange={(value) => updateBlockContent('sortBy', value)}
                onSortOrderChange={(value) => updateBlockContent('sortOrder', value)}
                onShowImageChange={(value) => updateBlockContent('showImage', value)}
                onShowTitleChange={(value) => updateBlockContent('showTitle', value)}
                onShowDescriptionChange={(value) => updateBlockContent('showDescription', value)}
                onIsPaginatedChange={(value) => updateBlockContent('isPaginated', value)}
                onItemsPerPageChange={(value) => updateBlockContent('itemsPerPage', value)}
                onViewAllTextChange={(value) => updateBlockContent('viewAllText', value)}
                onViewAllLinkChange={(value) => updateBlockContent('viewAllLink', value)}
                onVisibilityChange={(value) => updateBlockContent('visibility', value)}
                onBack={onBack}
              />
            )}
            {selectedBlock.type === 'divider' && (
              <PageDividerBlock
                {...selectedBlock.content}
                onSpacingTopChange={(value) => updateBlockContent('spacingTop', value)}
                onSpacingBottomChange={(value) => updateBlockContent('spacingBottom', value)}
                onDividerStyleChange={(value) => updateBlockContent('dividerStyle', value)}
                onLineStyleChange={(value) => updateBlockContent('lineStyle', value)}
                onLineWidthChange={(value) => updateBlockContent('lineWidth', value)}
                onLineThicknessChange={(value) => updateBlockContent('lineThickness', value)}
                onLineColorChange={(value) => updateBlockContent('lineColor', value)}
                onIconChange={(value) => updateBlockContent('icon', value)}
                onContainerWidthChange={(value) => updateBlockContent('containerWidth', value)}
                onCustomWidthChange={(value) => updateBlockContent('customWidth', value)}
                onVisibilityChange={(value) => updateBlockContent('visibility', value)}
                onBack={onBack}
              />
            )}
            {selectedBlock.type === 'auth' && (
              <PageAuthBlock
                {...selectedBlock.content}
                onDefaultTabChange={(value) => updateBlockContent('defaultTab', value)}
                onShowLoginTabChange={(value) => updateBlockContent('showLoginTab', value)}
                onShowRegisterTabChange={(value) => updateBlockContent('showRegisterTab', value)}
                onLoginRedirectPathChange={(value) => updateBlockContent('loginRedirectPath', value)}
                onRegisterRedirectPathChange={(value) => updateBlockContent('registerRedirectPath', value)}
                onEmailVerificationEnabledChange={(value) => updateBlockContent('emailVerificationEnabled', value)}
                onLoginButtonTextChange={(value) => updateBlockContent('loginButtonText', value)}
                onRegisterButtonTextChange={(value) => updateBlockContent('registerButtonText', value)}
                onResetButtonTextChange={(value) => updateBlockContent('resetButtonText', value)}
                onLoginTitleChange={(value) => updateBlockContent('loginTitle', value)}
                onLoginDescriptionChange={(value) => updateBlockContent('loginDescription', value)}
                onRegisterTitleChange={(value) => updateBlockContent('registerTitle', value)}
                onRegisterDescriptionChange={(value) => updateBlockContent('registerDescription', value)}
                onResetTitleChange={(value) => updateBlockContent('resetTitle', value)}
                onResetDescriptionChange={(value) => updateBlockContent('resetDescription', value)}
                onVisibilityChange={(value) => updateBlockContent('visibility', value)}
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
                onCodeChange={(value) => updateBlockContent('code', value)}
                onTypeChange={(value) => updateBlockContent('type', value)}
                onVisibilityChange={(value) => updateBlockContent('visibility', value)}
                onBack={onBack}
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
              allBlocks={currentPage.blocks}
              onSelectBlock={onSelectBlock}
              onSelectSiteChrome={onSelectSiteChrome}
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
