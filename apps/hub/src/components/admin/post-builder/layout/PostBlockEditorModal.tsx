"use client"

import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import {
  AdminModalContent,
  AdminModalFooter,
  AdminModalHeader,
  AdminModalScrollBody,
  AdminModalTitle,
} from "@/components/admin/shared/AdminModalLayout"
import { PostBlockEditor } from "./PostBlockEditor"
import type { PostBlock } from "@/lib/actions/posts/post-actions"

interface PostBlockEditorModalProps {
  block: PostBlock | null
  content: Record<string, any>
  siteId: string
  postTitle: string
  onPostTitleChange: (title: string) => void
  onContentChange: (field: string, value: any) => void
  onClose: () => void
  onSave: () => void
  saving?: boolean
  error?: string | null
}

export function PostBlockEditorModal({
  block,
  content,
  siteId,
  postTitle,
  onPostTitleChange,
  onContentChange,
  onClose,
  onSave,
  saving = false,
  error,
}: PostBlockEditorModalProps) {
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
          <AdminModalTitle>Edit {block.type}</AdminModalTitle>
        </AdminModalHeader>

        <AdminModalScrollBody>
              <PostBlockEditor
                block={block}
                content={content}
                onContentChange={onContentChange}
                siteId={siteId}
                postTitle={postTitle}
                onPostTitleChange={onPostTitleChange}
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
