import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { PostContentBlock } from "@/components/admin/post-builder/blocks/PostContentBlock"
import { RelatedPostsBlock } from "@/components/admin/post-builder/blocks/RelatedPostsBlock"
import { ScrollArea } from "@/components/ui/scroll-area"
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
    settings?: {
      favicon?: string
      [key: string]: any
    }
  }
  blocksLoading?: boolean
  onOpenPostSettings?: () => void
  onPostTitleChange?: (title: string) => void
  onSelectBlock?: (block: any) => void
  onBack?: () => void
}

export function BlockPropertiesPanel({
  selectedBlock,
  updateBlockContent,
  siteId,
  currentPost,
  site,
  blocksLoading = false,
  onOpenPostSettings,
  onPostTitleChange,
  onSelectBlock,
  onBack
}: BlockPropertiesPanelProps) {
  return (
    <div className="flex-1 overflow-hidden border-r bg-background">
      <ScrollArea className="h-full">
      {selectedBlock ? (
        <div className="pb-10">
        <AdminLayout>
            {selectedBlock.type === 'post-content' && (
              <PostContentBlock
                content={selectedBlock.content || {}}
                onContentChange={(field: string, value: any) =>
                  updateBlockContent(selectedBlock.id, {
                    content: { ...selectedBlock.content, [field]: value }
                  })
                }
                siteId={siteId}
                blockId={selectedBlock.id}
                postData={currentPost}
                onPostTitleChange={onPostTitleChange}
                onBack={onBack}
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
            {selectedBlock.type === 'related-posts' && (
              <RelatedPostsBlock
                content={selectedBlock.content || {}}
                onContentChange={(field: string, value: any) =>
                  updateBlockContent(selectedBlock.id, {
                    content: { ...selectedBlock.content, [field]: value }
                  })
                }
                onBack={onBack}
              />
            )}
        </AdminLayout>
        </div>
      ) : (
        <div className="min-h-full">
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
                ...site.settings, // preserve favicon and others
              }
            } : undefined}
            className="min-h-full"
            blocksLoading={blocksLoading}
            allBlocks={(currentPost?.blocks || []) as any}
            onSelectBlock={onSelectBlock}
          />
        </div>
      )}
      </ScrollArea>
    </div>
  )
}
