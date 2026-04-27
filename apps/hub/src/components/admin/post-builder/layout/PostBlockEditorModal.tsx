"use client"

import { useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { ModalTabs, ModalTabsProvider, useModalTabsDock } from "@/components/admin/layout/dashboard/modal-tabs"
import type { ModalTabItem } from "@/components/admin/layout/dashboard/modal-tabs"
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

interface PostBlockEditorModalProps {
  block: PostBlock | null
  content: Record<string, any>
  siteId: string
  postTitle: string
  postData?: Record<string, any>
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
  postData,
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
      <ModalTabsProvider>
        <PostBlockEditorModalContent
          block={block}
          content={content}
          siteId={siteId}
          postTitle={postTitle}
          postData={postData}
          onPostTitleChange={onPostTitleChange}
          onContentChange={onContentChange}
          onClose={onClose}
          onSave={onSave}
          saving={saving}
          error={error}
        />
      </ModalTabsProvider>
    </Dialog>
  )
}

function PostBlockEditorModalContent({
  block,
  content,
  siteId,
  postTitle,
  postData,
  onPostTitleChange,
  onContentChange,
  onClose,
  onSave,
  saving = false,
  error,
}: PostBlockEditorModalProps & { block: PostBlock }) {
  const dock = useModalTabsDock()
  const modalTabs = useMemo<ModalTabItem[]>(() => {
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

    if (block.type === "post-content") return postContentTabs
    if (block.type === "related-posts") return relatedPostsTabs
    if (block.type === "table-of-contents") return tableOfContentsTabs
    return []
  }, [block.type])
  const setModalTabs = dock?.setTabs
  const clearModalTabs = dock?.clearTabs
  const activeTab = (dock?.activeTab || "content") as PostContentBlockTab | RelatedPostsBlockTab | TableOfContentsBlockTab

  useEffect(() => {
    if (!setModalTabs || !clearModalTabs) return

    setModalTabs(modalTabs, "content")
    return clearModalTabs
  }, [setModalTabs, clearModalTabs, modalTabs, block.id])

  return (
    <AdminModalContent size="wide">
      <AdminModalHeader>
        <div className="flex min-w-0 items-center gap-4 pr-10">
          <AdminModalTitle className="shrink-0">Edit {getBlockName(block.type)}</AdminModalTitle>
          <ModalTabs />
        </div>
      </AdminModalHeader>

      <AdminModalScrollBody>
        <PostBlockEditor
          block={block}
          content={content}
          onContentChange={onContentChange}
          siteId={siteId}
          postTitle={postTitle}
          postData={postData}
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
  )
}
