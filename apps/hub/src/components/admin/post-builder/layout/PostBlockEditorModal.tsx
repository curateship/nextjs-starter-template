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
import { getBlockName } from "@/components/admin/post-builder/config/post-block-types"
import type { PostContentBlockTab } from "@/components/admin/post-builder/blocks/PostContentBlock"
import type { RelatedPostsBlockTab } from "@/components/admin/post-builder/blocks/RelatedPostsBlock"
import type { TableOfContentsBlockTab } from "@/components/admin/post-builder/blocks/TableOfContentsBlock"
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
  const [activeTab, setActiveTab] = useState<PostContentBlockTab | RelatedPostsBlockTab | TableOfContentsBlockTab>("content")

  useEffect(() => {
    setActiveTab("content")
  }, [block?.id])

  if (!block) return null

  const postContentTabs: Array<{ value: PostContentBlockTab; label: string }> = [
    { value: "content", label: "Content" },
    { value: "styling", label: "Styling" },
    { value: "settings", label: "Settings" },
  ]
  const tableOfContentsTabs: Array<{ value: TableOfContentsBlockTab; label: string }> = [
    { value: "content", label: "Content" },
    { value: "settings", label: "Settings" },
  ]
  const relatedPostsTabs: Array<{ value: RelatedPostsBlockTab; label: string }> = [
    { value: "content", label: "Content" },
    { value: "styling", label: "Styling" },
    { value: "settings", label: "Settings" },
  ]
  const modalTabs = block.type === "post-content"
    ? postContentTabs
    : block.type === "related-posts"
      ? relatedPostsTabs
    : block.type === "table-of-contents"
      ? tableOfContentsTabs
      : []

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
            <AdminModalTitle className="shrink-0">Edit {getBlockName(block.type)}</AdminModalTitle>
            {modalTabs.length > 0 && (
              <div className="inline-flex h-9 items-center gap-1 rounded-md bg-muted p-1 text-muted-foreground">
                {modalTabs.map((tab) => (
                  <button
                    key={tab.value}
                    type="button"
                    onClick={() => setActiveTab(tab.value)}
                    className={cn(
                      "inline-flex h-7 cursor-pointer items-center justify-center whitespace-nowrap rounded-sm px-3 text-sm font-medium transition-all hover:bg-background/50",
                      activeTab === tab.value && "bg-background text-foreground shadow-sm"
                    )}
                    aria-pressed={activeTab === tab.value}
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
            postContentTab={block.type === "post-content" ? activeTab as PostContentBlockTab : undefined}
            relatedPostsTab={block.type === "related-posts" ? activeTab as RelatedPostsBlockTab : undefined}
            tableOfContentsTab={block.type === "table-of-contents" ? activeTab as TableOfContentsBlockTab : undefined}
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
