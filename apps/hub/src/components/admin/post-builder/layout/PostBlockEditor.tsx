"use client"

import { CoreBlock } from "@/components/admin/post-builder/blocks/CoreBlock"
import type { CoreBlockTab } from "@/components/admin/post-builder/blocks/CoreBlock"
import { RelatedPostsBlock } from "@/components/admin/post-builder/blocks/RelatedPostsBlock"
import type { RelatedPostsBlockTab } from "@/components/admin/post-builder/blocks/RelatedPostsBlock"
import { TableOfContentsBlock } from "@/components/admin/post-builder/blocks/TableOfContentsBlock"
import type { TableOfContentsBlockTab } from "@/components/admin/post-builder/blocks/TableOfContentsBlock"
import type { PostBlock } from "@/lib/actions/posts/post-actions"

interface PostBlockEditorProps {
  block: PostBlock
  content: Record<string, any>
  onContentChange: (field: string, value: any) => void
  siteId: string
  postTitle: string
  postData?: Record<string, any>
  onPostTitleChange: (title: string) => void
  coreTab?: CoreBlockTab
  relatedPostsTab?: RelatedPostsBlockTab
  tableOfContentsTab?: TableOfContentsBlockTab
  mode?: "post" | "template"
}

export function PostBlockEditor({
  block,
  content,
  onContentChange,
  siteId,
  postTitle,
  postData,
  onPostTitleChange,
  coreTab,
  relatedPostsTab,
  tableOfContentsTab,
  mode = "post",
}: PostBlockEditorProps) {
  if (block.type === "core") {
    const activeTab = mode === "post"
      ? "content"
      : mode === "template" && coreTab === "content" ? "settings" : coreTab

    return (
      <CoreBlock
        content={content}
        onContentChange={onContentChange}
        siteId={siteId}
        blockId={block.id}
        postData={{ ...postData, title: postTitle }}
        onPostTitleChange={onPostTitleChange}
        activeTab={activeTab}
      />
    )
  }

  if (block.type === "related-posts") {
    return (
      <RelatedPostsBlock
        content={content}
        onContentChange={onContentChange}
        activeTab={relatedPostsTab}
      />
    )
  }

  if (block.type === "table-of-contents") {
    return (
      <TableOfContentsBlock
        content={content}
        onContentChange={onContentChange}
        activeTab={tableOfContentsTab}
      />
    )
  }

  return null
}
