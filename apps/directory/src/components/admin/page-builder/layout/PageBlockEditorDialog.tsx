"use client"

import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { ModalTabs, ModalTabsProvider } from "@/components/admin/layout/dashboard/modal-tabs"
import { DashboardModalContent } from "@/components/admin/layout/dashboard/modals"
import { PageHeroBlock } from "../blocks/hero/PageHeroBlock"
import { PageRichTextEditorBlock } from "../blocks/rich-text-editor/PageRichTextEditorBlock"
import { PageFaqBlock } from "../blocks/faq/PageFaqBlock"
import { PageListingViewBlock } from "../blocks/listing-view/PageListingViewBlock"
import { PageDividerBlock } from "../blocks/divider/PageDividerBlock"
import { PageAuthBlock } from "../blocks/auth/PageAuthBlock"
import { PageEmbeddedBlock } from "../blocks/embedded/PageEmbeddedBlock"
import { PageTestimonialsBlock } from "../blocks/testimonials/PageTestimonialsBlock"
import { PageCategoriesListingBlock } from "../blocks/categories-listing/PageCategoriesListingBlock"
import { PageSiteSearchBlock } from "../blocks/site-search/PageSiteSearchBlock"
import { PageMemberDirectoryBlock } from "../blocks/member-directory/PageMemberDirectoryBlock"
import { PageEventsCalendarBlock } from "../blocks/events-calendar/PageEventsCalendarBlock"
import { getBlockName } from "../config/page-block-types"
import type { ContentBlock as PageBlock } from "@/lib/utils/block-utils"

interface PageBlockEditorDialogProps {
  selectedBlock: PageBlock | null
  draftContent: Record<string, any>
  siteId: string
  isSaving: boolean
  onOpenChange: (open: boolean) => void
  onContentChange: (field: string, value: any) => void
  onSave: () => void
}

export function PageBlockEditorDialog({
  selectedBlock,
  draftContent,
  siteId,
  isSaving,
  onOpenChange,
  onContentChange,
  onSave,
}: PageBlockEditorDialogProps) {
  if (!selectedBlock) return null

  return (
    <Dialog open={!!selectedBlock} onOpenChange={onOpenChange}>
      <ModalTabsProvider>
        <DashboardModalContent
          title={`Edit ${selectedBlock.title || getBlockName(selectedBlock.type)}`}
          titleAccessory={<ModalTabs />}
          className="max-w-[960px]"
          footer={
            <>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
                Cancel
              </Button>
              <Button type="button" onClick={onSave} disabled={isSaving}>
                {isSaving ? "Saving..." : "Save"}
              </Button>
            </>
          }
        >
          {selectedBlock.type === "hero" && (
                  <PageHeroBlock
                    content={draftContent}
                    onContentChange={onContentChange}
                    siteId={siteId}
                    blockId={selectedBlock.id}
                  />
                )}

                {selectedBlock.type === "rich-text" && (
                  <PageRichTextEditorBlock
                    content={draftContent}
                    onContentChange={onContentChange}
                    siteId={siteId}
                    blockId={selectedBlock.id}
                  />
                )}

                {selectedBlock.type === "faq" && (
                  <PageFaqBlock
                    title={draftContent.title ?? ""}
                    subtitle={draftContent.subtitle ?? ""}
                    headerAlign={draftContent.headerAlign ?? "left"}
                    faqItems={draftContent.faqItems ?? draftContent.faqs}
                    onTitleChange={(value) => onContentChange("title", value)}
                    onSubtitleChange={(value) => onContentChange("subtitle", value)}
                    onHeaderAlignChange={(value) => onContentChange("headerAlign", value)}
                    onFaqItemsChange={(value) => onContentChange("faqItems", value)}
                    visibility={draftContent.visibility}
                    onVisibilityChange={(value) => onContentChange("visibility", value)}
                  />
                )}

                {selectedBlock.type === "listing-views" && (
                  <PageListingViewBlock
                    {...draftContent}
                    onTitleChange={(value) => onContentChange("title", value)}
                    onSubtitleChange={(value) => onContentChange("subtitle", value)}
                    onHeaderAlignChange={(value) => onContentChange("headerAlign", value)}
                    onMobileHeaderAlignChange={(value) => onContentChange("mobileHeaderAlign", value)}
                    onContentTypeChange={(value) => onContentChange("contentType", value)}
                    onCategoryIdsChange={(value) => onContentChange("categoryIds", value)}
                    onListingStyleChange={(value) => onContentChange("listingStyle", value)}
                    onImageFitChange={(value) => onContentChange("imageFit", value)}
                    onImageHeightChange={(value) => onContentChange("imageHeight", value)}
                    onSaveIconOpacityChange={(value) => onContentChange("saveIconOpacity", value)}
                    onCategoryChipParentIdsChange={(value) => onContentChange("categoryChipParentIds", value)}
                    onDisplayModeChange={(value) => onContentChange("displayMode", value)}
                    onItemsToShowChange={(value) => onContentChange("itemsToShow", value)}
                    onMobileColumnsChange={(value) => onContentChange("mobileColumns", value)}
                    onColumnsChange={(value) => onContentChange("columns", value)}
                    onSortByChange={(value) => onContentChange("sortBy", value)}
                    onSortOrderChange={(value) => onContentChange("sortOrder", value)}
                    onIsPaginatedChange={(value) => onContentChange("isPaginated", value)}
                    onItemsPerPageChange={(value) => onContentChange("itemsPerPage", value)}
                    onViewAllTextChange={(value) => onContentChange("viewAllText", value)}
                    onViewAllLinkChange={(value) => onContentChange("viewAllLink", value)}
                    onVisibilityChange={(value) => onContentChange("visibility", value)}
                    siteId={siteId}
                  />
                )}

                {selectedBlock.type === "categories-listing" && (
                  <PageCategoriesListingBlock
                    content={draftContent}
                    onContentChange={onContentChange}
                    siteId={siteId}
                  />
                )}

                {selectedBlock.type === "site-search" && (
                  <PageSiteSearchBlock
                    content={draftContent}
                    onContentChange={onContentChange}
                  />
                )}

                {selectedBlock.type === "member-directory" && (
                  <PageMemberDirectoryBlock
                    content={draftContent}
                    onContentChange={onContentChange}
                  />
                )}

                {selectedBlock.type === "events-calendar" && (
                  <PageEventsCalendarBlock
                    content={draftContent}
                    onContentChange={onContentChange}
                  />
                )}

                {selectedBlock.type === "divider" && (
                  <PageDividerBlock
                    {...draftContent}
                    siteId={siteId}
                    onSpacingTopChange={(value) => onContentChange("spacingTop", value)}
                    onSpacingBottomChange={(value) => onContentChange("spacingBottom", value)}
                    onDividerStyleChange={(value) => onContentChange("dividerStyle", value)}
                    onLineStyleChange={(value) => onContentChange("lineStyle", value)}
                    onLineWidthChange={(value) => onContentChange("lineWidth", value)}
                    onLineThicknessChange={(value) => onContentChange("lineThickness", value)}
                    onLineColorChange={(value) => onContentChange("lineColor", value)}
                    onIconChange={(value) => onContentChange("icon", value)}
                    onDividerImageChange={(value) => onContentChange("dividerImage", value)}
                    onDividerImageOpacityChange={(value) => onContentChange("dividerImageOpacity", value)}
                    onContainerWidthChange={(value) => onContentChange("containerWidth", value)}
                    onCustomWidthChange={(value) => onContentChange("customWidth", value)}
                    onVisibilityChange={(value) => onContentChange("visibility", value)}
                  />
                )}

                {selectedBlock.type === "auth" && (
                  <PageAuthBlock
                    {...draftContent}
                    onDefaultTabChange={(value) => onContentChange("defaultTab", value)}
                    onLoginRedirectPathChange={(value) => onContentChange("loginRedirectPath", value)}
                    onRegisterRedirectPathChange={(value) => onContentChange("registerRedirectPath", value)}
                    onEmailVerificationEnabledChange={(value) => onContentChange("emailVerificationEnabled", value)}
                    onLoginButtonTextChange={(value) => onContentChange("loginButtonText", value)}
                    onRegisterButtonTextChange={(value) => onContentChange("registerButtonText", value)}
                    onResetButtonTextChange={(value) => onContentChange("resetButtonText", value)}
                    onLoginTitleChange={(value) => onContentChange("loginTitle", value)}
                    onLoginDescriptionChange={(value) => onContentChange("loginDescription", value)}
                    onRegisterTitleChange={(value) => onContentChange("registerTitle", value)}
                    onRegisterDescriptionChange={(value) => onContentChange("registerDescription", value)}
                    onResetTitleChange={(value) => onContentChange("resetTitle", value)}
                    onResetDescriptionChange={(value) => onContentChange("resetDescription", value)}
                    onVisibilityChange={(value) => onContentChange("visibility", value)}
                  />
                )}

                {selectedBlock.type === "testimonials" && (
                  <PageTestimonialsBlock
                    content={draftContent}
                    onContentChange={onContentChange}
                    siteId={siteId}
                    blockId={selectedBlock.id}
                  />
                )}

                {selectedBlock.type === "embedded" && (
                  <PageEmbeddedBlock
                    {...draftContent}
                    onCodeChange={(value) => onContentChange("code", value)}
                    onTypeChange={(value) => onContentChange("type", value)}
                    onVisibilityChange={(value) => onContentChange("visibility", value)}
                  />
                )}
          </DashboardModalContent>
      </ModalTabsProvider>
    </Dialog>
  )
}
