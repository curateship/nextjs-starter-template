import { PostContentBlock } from "@/components/admin/post-builder/blocks/PostContentBlock"
import { PostPreview } from "./PostPreview"
import type { PostBlock } from "@/lib/actions/posts/post-actions"

interface PostBlockWithId extends PostBlock {
  id: string
}

interface BlockPropertiesPanelProps {
  selectedBlock: PostBlockWithId | null
  updateBlockContent: (blockId: string, updates: Partial<PostBlockWithId>) => void
  siteId: string
  currentPost?: {
    slug: string
    name: string
    blocks: PostBlockWithId[]
    id?: string
    title?: string
    meta_description?: string
    site_id?: string
    featured_image?: string | null
    excerpt?: string | null
    is_published?: boolean
  }
  site?: {
    id: string
    name: string
    subdomain: string
  }
  siteBlocks?: {
    navigation?: any
    footer?: any
    show_featured_image?: boolean
  } | null
  blocksLoading?: boolean
  onOpenPostSettings?: () => void
}

export function BlockPropertiesPanel({
  selectedBlock,
  updateBlockContent,
  siteId,
  currentPost,
  site,
  siteBlocks,
  blocksLoading = false,
  onOpenPostSettings
}: BlockPropertiesPanelProps) {
  return (
    <div className="flex-1 border-r bg-muted/30 p-4 overflow-y-auto">
      {selectedBlock ? (
        <div>
          <div className="space-y-4">
            {(selectedBlock.type === 'rich-text' || selectedBlock.type === 'post-content') && (
              <PostContentBlock
                block={selectedBlock as any}
                onContentChange={(content: Record<string, any>) => 
                  updateBlockContent(selectedBlock.id, { content })
                }
              />
            )}
            {/* Future block types can be added here */}
            {selectedBlock.type === 'image' && (
              <div className="text-center text-muted-foreground p-8">
                Image block editor coming soon
              </div>
            )}
            {selectedBlock.type === 'code' && (
              <div className="text-center text-muted-foreground p-8">
                Code block editor coming soon
              </div>
            )}
            {selectedBlock.type === 'quote' && (
              <div className="text-center text-muted-foreground p-8">
                Quote block editor coming soon
              </div>
            )}
            {selectedBlock.type === 'divider' && (
              <div className="text-center text-muted-foreground p-8">
                Divider block editor coming soon
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="h-full">
          <PostPreview 
            blocks={(currentPost?.blocks || []) as any} 
            post={currentPost ? {
              id: currentPost.id || 'preview',
              title: currentPost.title || currentPost.name,
              slug: currentPost.slug,
              meta_description: currentPost.meta_description,
              site_id: currentPost.site_id || siteId,
              featured_image: currentPost.featured_image || null,
              show_featured_image: (currentPost as any)?.show_featured_image !== false,
              excerpt: currentPost.excerpt || null,
              is_published: currentPost.is_published || false
            } : undefined}
            site={site ? {
              ...site,
              settings: {
                navigation: siteBlocks?.navigation,
                footer: siteBlocks?.footer,
                show_featured_image: siteBlocks?.show_featured_image
              }
            } : undefined}
            className="h-full"
            blocksLoading={blocksLoading}
          />
        </div>
      )}
    </div>
  )
}