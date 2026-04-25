"use client"

import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import type { DirectoryCustomBlockTemplate } from "@/lib/actions/directories/directory-custom-blocks/types"
import {
  AdminModalContent,
  AdminModalFooter,
  AdminModalHeader,
  AdminModalScrollBody,
  AdminModalTitle,
} from "@/components/admin/layout/builder/AdminModalLayout"
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
  directoryDescription?: string | null
  directoryFeaturedImage?: string | null
  onDirectoryTitleChange: (title: string) => void
  onDirectoryDescriptionChange?: (description: string) => void
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
  directoryDescription,
  directoryFeaturedImage,
  onDirectoryTitleChange,
  onDirectoryDescriptionChange,
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
      <AdminModalContent size="wide">
        <AdminModalHeader>
          <AdminModalTitle>Edit {block.title}</AdminModalTitle>
        </AdminModalHeader>

        <AdminModalScrollBody>
              <DirectoryBlockEditor
                block={block}
                content={content}
                onContentChange={onContentChange}
                siteId={siteId}
                directoryTitle={directoryTitle}
                directoryDescription={directoryDescription}
                directoryFeaturedImage={directoryFeaturedImage}
                onDirectoryTitleChange={onDirectoryTitleChange}
                onDirectoryDescriptionChange={onDirectoryDescriptionChange}
                onDirectoryFeaturedImageChange={onDirectoryFeaturedImageChange}
                customBlockTemplates={customBlockTemplates}
                showDirectoryTitleField={showDirectoryTitleField}
              />
        </AdminModalScrollBody>

        <AdminModalFooter className="sm:justify-between">
          {error ? <p className="text-sm text-red-600">{error}</p> : <div />}
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="button" onClick={onSave} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </AdminModalFooter>
      </AdminModalContent>
    </Dialog>
  )
}
