"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import {
  AdminModalContent,
  AdminModalFooter,
  AdminModalHeader,
  AdminModalScrollBody,
  AdminModalTitle,
} from "@/components/admin/layout/builder/AdminModalLayout"
import { PostBlockEditor } from "./PostBlockEditor"
import type { PostBlock } from "@/lib/actions/posts/post-actions"
import type { PostContentBlockTab } from "@/components/admin/post-builder/blocks/PostContentBlock"
import { cn } from "@/lib/utils/tailwind"

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
  const [postContentTab, setPostContentTab] = useState<PostContentBlockTab>("content")

  useEffect(() => {
    setPostContentTab("content")
  }, [block?.id])

  if (!block) return null

  const postContentTabs: Array<{ value: PostContentBlockTab; label: string }> = [
    { value: "content", label: "Content" },
    { value: "styling", label: "Styling" },
    { value: "settings", label: "Settings" },
  ]

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <AdminModalContent size="wide">
        <AdminModalHeader>
          <div className="flex min-w-0 items-center gap-4 pr-10">
            <AdminModalTitle className="shrink-0">Edit {block.type}</AdminModalTitle>
            {block.type === "post-content" && (
            <div className="inline-flex h-9 items-center gap-1 rounded-md bg-muted p-1 text-muted-foreground">
              {postContentTabs.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setPostContentTab(tab.value)}
                  className={cn(
                    "inline-flex h-7 cursor-pointer items-center justify-center whitespace-nowrap rounded-sm px-3 text-sm font-medium transition-all hover:bg-background/50",
                    postContentTab === tab.value && "bg-background text-foreground shadow-sm"
                  )}
                  aria-pressed={postContentTab === tab.value}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            )}
          </div>
        </AdminModalHeader>

        <AdminModalScrollBody>
              <PostBlockEditor
                block={block}
                content={content}
                onContentChange={onContentChange}
                siteId={siteId}
                postTitle={postTitle}
                onPostTitleChange={onPostTitleChange}
                postContentTab={postContentTab}
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
