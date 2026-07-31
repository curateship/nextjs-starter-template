"use client"

import { Button } from "@/components/ui/button"
import Loader2 from "lucide-react/dist/esm/icons/loader-circle.js"
import { Dialog } from "@/components/ui/dialog"
import { ModalTabs, ModalTabsProvider } from "@/components/admin/layout/dashboard/modal-tabs"
import type { DirectoryCustomBlockTemplate } from "@/lib/actions/directories/directory-custom-blocks/types"
import { DashboardModalContent } from "@/components/admin/layout/dashboard/modals"
import { DirectoryBlockEditor, type DirectoryBlockEditorMode } from "./DirectoryBlockEditor"

interface DirectoryBlock {
  id: string
  type: string
  title: string
  content: Record<string, any>
}

interface DirectoryBlockEditorModalProps {
  block: DirectoryBlock | null
  content: Record<string, any>
  siteId: string
  directoryTitle: string
  directoryFeaturedImage?: string | null
  onDirectoryTitleChange: (title: string) => void
  onDirectoryFeaturedImageChange?: (featuredImage: string) => void
  onContentChange: (field: string, value: any) => void
  customBlockTemplates: DirectoryCustomBlockTemplate[]
  showDirectoryTitleField?: boolean
  onClose: () => void
  onSave: () => void
  saving?: boolean
  mode?: DirectoryBlockEditorMode
}

export function DirectoryBlockEditorModal({
  block,
  content,
  siteId,
  directoryTitle,
  directoryFeaturedImage,
  onDirectoryTitleChange,
  onDirectoryFeaturedImageChange,
  onContentChange,
  customBlockTemplates,
  showDirectoryTitleField = true,
  onClose,
  onSave,
  saving = false,
  mode = "listing",
}: DirectoryBlockEditorModalProps) {
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
          footer={
            <>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button form="directory-block-editor-form" type="submit" disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              Save
            </Button>
            </>
          }
        >
          <form
            noValidate
            id="directory-block-editor-form"
            className="contents"
            onSubmit={(event) => {
              event.preventDefault()
              onSave()
            }}
          >
          <DirectoryBlockEditor
            block={block}
            content={content}
            onContentChange={onContentChange}
            siteId={siteId}
            directoryTitle={directoryTitle}
            directoryFeaturedImage={directoryFeaturedImage}
            onDirectoryTitleChange={onDirectoryTitleChange}
            onDirectoryFeaturedImageChange={onDirectoryFeaturedImageChange}
            customBlockTemplates={customBlockTemplates}
            showDirectoryTitleField={showDirectoryTitleField}
            mode={mode}
          />
          </form>
        </DashboardModalContent>
      </ModalTabsProvider>
    </Dialog>
  )
}
