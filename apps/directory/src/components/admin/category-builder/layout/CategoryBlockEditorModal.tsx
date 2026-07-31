"use client"

import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { ModalTabs, ModalTabsProvider } from "@/components/admin/layout/dashboard/modal-tabs"
import { DashboardModalContent, DashboardModalFooterActions } from "@/components/admin/layout/dashboard/modals"
import { CategoryBlockEditor, type CategoryBlockEditorMode } from "./CategoryBlockEditor"

interface CategoryBlock {
  id: string
  type: string
  title: string
  content: Record<string, any>
}

interface CategoryBlockEditorModalProps {
  block: CategoryBlock | null
  content: Record<string, any>
  siteId: string
  onContentChange: (field: string, value: any) => void
  onClose: () => void
  onSave: () => void
  saving?: boolean
  error?: string | null
  mode?: CategoryBlockEditorMode
  // Core block only: title/featured image write through to the category row
  categoryTitle?: string
  categoryFeaturedImage?: string | null
  onCategoryTitleChange?: (title: string) => void
  onCategoryFeaturedImageChange?: (featuredImage: string) => void
}

export function CategoryBlockEditorModal({
  block,
  content,
  siteId,
  onContentChange,
  onClose,
  onSave,
  saving = false,
  error,
  mode = "listing",
  categoryTitle,
  categoryFeaturedImage,
  onCategoryTitleChange,
  onCategoryFeaturedImageChange,
}: CategoryBlockEditorModalProps) {
  if (!block) return null

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <ModalTabsProvider>
        <DashboardModalContent
          title={`${mode === "template" ? "Configure" : "Edit"} ${block.title}`}
          titleAccessory={<ModalTabs />}
          className="h-[calc(100vh-4rem)] max-h-[820px] max-w-[960px]"
          footer={
            <>
              {error ? <p className="text-sm text-destructive">{error}</p> : <div />}
              <DashboardModalFooterActions>
                <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
                  Cancel
                </Button>
                <Button type="button" onClick={onSave} disabled={saving}>
                  {saving ? "Saving..." : "Save"}
                </Button>
              </DashboardModalFooterActions>
            </>
          }
          footerClassName="sm:justify-between"
        >
          <CategoryBlockEditor
            block={block}
            content={content}
            onContentChange={onContentChange}
            siteId={siteId}
            mode={mode}
            categoryTitle={categoryTitle}
            categoryFeaturedImage={categoryFeaturedImage}
            onCategoryTitleChange={onCategoryTitleChange}
            onCategoryFeaturedImageChange={onCategoryFeaturedImageChange}
          />
        </DashboardModalContent>
      </ModalTabsProvider>
    </Dialog>
  )
}
