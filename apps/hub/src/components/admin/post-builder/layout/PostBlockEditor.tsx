"use client"

import { PostContentBlock } from "@/components/admin/post-builder/blocks/PostContentBlock"
import { RelatedPostsBlock } from "@/components/admin/post-builder/blocks/RelatedPostsBlock"
import type { PostBlock } from "@/lib/actions/posts/post-actions"

interface PostBlockEditorProps {
  block: PostBlock
  content: Record<string, any>
  onContentChange: (field: string, value: any) => void
  siteId: string
  postTitle: string
  onPostTitleChange: (title: string) => void
}

export function PostBlockEditor({
  block,
  content,
  onContentChange,
  siteId,
  postTitle,
  onPostTitleChange,
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
      />
    )
  }

  if (block.type === "related-posts") {
    return (
      <RelatedPostsBlock
        content={content}
        onContentChange={onContentChange}
      />
    )
  }

  if (block.type === "image") {
    return <div className="p-8 text-center text-muted-foreground">Image block editor coming soon</div>
  }

  if (block.type === "code") {
    return <div className="p-8 text-center text-muted-foreground">Code block editor coming soon</div>
  }

  if (block.type === "quote") {
    return <div className="p-8 text-center text-muted-foreground">Quote block editor coming soon</div>
  }

  if (block.type === "divider") {
    return <div className="p-8 text-center text-muted-foreground">Divider block editor coming soon</div>
  }

  return null
}
