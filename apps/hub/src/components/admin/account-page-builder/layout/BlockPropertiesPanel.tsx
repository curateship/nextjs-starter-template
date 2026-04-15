import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { ScrollArea } from "@/components/ui/scroll-area"
import { PagePreview } from "../../page-builder/layout/PagePreview"
import { PageAuthBlock } from "@/components/admin/page-builder/blocks/auth/PageAuthBlock"
import { PageRichTextEditorBlock } from "@/components/admin/page-builder/blocks/rich-text-editor/PageRichTextEditorBlock"
import { PageFaqBlock } from "@/components/admin/page-builder/blocks/faq/PageFaqBlock"
import { PageDividerBlock } from "@/components/admin/page-builder/blocks/divider/PageDividerBlock"
import type { ContentBlock as PageBlock } from "@/lib/utils/block-utils"

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
  onSelectSiteChrome?: (type: 'navigation' | 'footer') => void
}

export function BlockPropertiesPanel({
  selectedBlock,
  updateBlockContent,
  siteId,
  currentPage,
  site,
  blocksLoading = false,
  onSelectSiteChrome
}: BlockPropertiesPanelProps) {
  return (
    <div className="flex-1 overflow-hidden border-r bg-background">
      <ScrollArea className="h-full">
      {selectedBlock ? (
        <div className="pb-10">
        <AdminLayout>
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
              />
            )}
            {selectedBlock.type === 'auth' && (
              <PageAuthBlock
                {...selectedBlock.content}
                {...(createCallbacks(updateBlockContent, [
                  'defaultTab',
                  'showLoginTab',
                  'showRegisterTab',
                  'loginRedirectPath',
                  'registerRedirectPath',
                  'emailVerificationEnabled',
                  'loginButtonText',
                  'registerButtonText',
                  'resetButtonText',
                  'loginTitle',
                  'loginDescription',
                  'registerTitle',
                  'registerDescription',
                  'resetTitle',
                  'resetDescription',
                  'visibility',
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
