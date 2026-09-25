"use client"

import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { ModalTabs, ModalTabsProvider } from "@/components/admin/layout/dashboard/modal-tabs"
import { DashboardModalContent, DashboardModalFormFooter } from "@/components/admin/layout/dashboard/modals"
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
          busy={saving}
          title={`${mode === "template" ? "Configure" : "Edit"} ${block.title}`}
          titleAccessory={<ModalTabs />}
          footer={<DashboardModalFormFooter busy={saving} cancelDisabled={saving} form="category-block-editor-form" onCancel={onClose} submitLabel="Save" />}
        >
          <form
            noValidate
            id="category-block-editor-form"
            className="contents"
            onSubmit={(event) => {
              event.preventDefault()
              onSave()
            }}
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
          </form>
        </DashboardModalContent>
      </ModalTabsProvider>
    </Dialog>
  )
}
