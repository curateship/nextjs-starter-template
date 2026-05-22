"use client"

import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { ModalTabs, ModalTabsProvider } from "@/components/admin/layout/dashboard/modal-tabs"
import type { DirectoryCustomBlockTemplate } from "@/lib/actions/directories/directory-custom-blocks/types"
import { DashboardModalContent, DashboardModalFooterActions } from "@/components/admin/layout/dashboard/modals"
import { DirectoryBlockEditor } from "./DirectoryBlockEditor"

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
  error?: string | null
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
  error,
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
          title={`Edit ${block.title}`}
          titleAccessory={<ModalTabs />}
          className="h-[calc(100vh-4rem)] max-h-[820px] max-w-[960px]"
          footer={
            <>
              {error ? <p className="text-sm text-red-600">{error}</p> : <div />}
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
          />
        </DashboardModalContent>
      </ModalTabsProvider>
    </Dialog>
  )
}
