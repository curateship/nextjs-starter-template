import { PostContentBlock } from "@/components/admin/layout/post-builder/PostContentBlock"
import { PostPreview } from "./PostPreview"

interface PostBlock {
  id: string
  type: string
  title: string
  content: Record<string, any>
}

interface PostBlockPropertiesPanelProps {
  selectedBlock: PostBlock | null
  updateBlockContent: (field: string, value: any) => void
  siteId: string
  currentPost?: {
    slug: string
    name: string
    blocks: PostBlock[]
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
  } | null
  blocksLoading?: boolean
  onOpenPostSettings?: () => void
}

export function PostBlockPropertiesPanel({
  selectedBlock,
  updateBlockContent,
  siteId,
  currentPost,
  site,
  siteBlocks,
  blocksLoading = false,
  onOpenPostSettings
}: PostBlockPropertiesPanelProps) {
  return (
    <div className="flex-1 border-r bg-muted/30 p-4 overflow-y-auto">
      {selectedBlock ? (
        <div>
          <div className="space-y-4">
            {selectedBlock.type === 'post-content' && (
              <PostContentBlock
                content={selectedBlock.content.content || ''}
                onContentChange={(value) => updateBlockContent('content', value)}
              />
            )}
          </div>
        </div>
      ) : (
        <div className="h-full">
          <PostPreview 
            blocks={currentPost?.blocks || []} 
            post={currentPost ? {
              id: currentPost.id || 'preview',
              title: currentPost.title || currentPost.name,
              slug: currentPost.slug,
              meta_description: currentPost.meta_description,
              site_id: currentPost.site_id || siteId,
              featured_image: currentPost.featured_image || null,
              excerpt: currentPost.excerpt || null,
              is_published: currentPost.is_published || false
            } : undefined}
            site={site}
            siteBlocks={siteBlocks}
            className="h-full"
            blocksLoading={blocksLoading}
          />
        </div>
      )}
    </div>
  )
}