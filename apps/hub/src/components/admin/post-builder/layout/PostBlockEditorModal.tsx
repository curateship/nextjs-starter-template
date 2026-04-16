"use client"

import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  AdminModalBody,
  AdminModalContent,
  AdminModalFooter,
  AdminModalHeader,
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
      <AdminModalContent size="wide" className="h-[calc(100vh-4rem)] max-h-[820px]">
        <AdminModalHeader>
          <AdminModalTitle>Edit {block.type}</AdminModalTitle>
        </AdminModalHeader>

        <AdminModalBody className="flex-1 min-h-0 overflow-hidden p-0">
          <ScrollArea className="h-full">
            <div className="px-6 pt-6 pb-0 pr-8 [&_h3]:pt-4">
              <PostBlockEditor
                block={block}
                content={content}
                onContentChange={onContentChange}
                siteId={siteId}
                postTitle={postTitle}
                onPostTitleChange={onPostTitleChange}
              />
            </div>
          </ScrollArea>
        </AdminModalBody>

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
