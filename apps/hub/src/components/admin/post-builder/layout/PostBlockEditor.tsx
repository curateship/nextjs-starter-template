"use client"

import { PostContentBlock } from "@/components/admin/post-builder/blocks/PostContentBlock"
import type { PostContentBlockTab } from "@/components/admin/post-builder/blocks/PostContentBlock"
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
  onPostTitleChange: (title: string) => void
  postContentTab?: PostContentBlockTab
  relatedPostsTab?: RelatedPostsBlockTab
  tableOfContentsTab?: TableOfContentsBlockTab
}

export function PostBlockEditor({
  block,
  content,
  onContentChange,
  siteId,
  postTitle,
  onPostTitleChange,
  postContentTab,
  relatedPostsTab,
  tableOfContentsTab,
}: PostBlockEditorProps) {
  if (block.type === "post-content") {
    return (
      <PostContentBlock
        content={content}
        onContentChange={onContentChange}
        siteId={siteId}
        blockId={block.id}
        postData={{ title: postTitle }}
        onPostTitleChange={onPostTitleChange}
        activeTab={postContentTab}
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
