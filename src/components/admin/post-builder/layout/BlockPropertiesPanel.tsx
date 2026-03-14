import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { PostContentBlock } from "@/components/admin/post-builder/blocks/PostContentBlock"
import { RelatedPostsBlock } from "@/components/admin/post-builder/blocks/RelatedPostsBlock"
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
  siteBlocks?: {
    navigation?: any
    footer?: any
    show_featured_image?: boolean
  } | null
  blocksLoading?: boolean
  onOpenPostSettings?: () => void
  onPostTitleChange?: (title: string) => void
  onSelectBlock?: (block: any) => void
}

export function BlockPropertiesPanel({
  selectedBlock,
  updateBlockContent,
  siteId,
  currentPost,
  site,
  siteBlocks,
  blocksLoading = false,
  onOpenPostSettings,
  onPostTitleChange,
  onSelectBlock
}: BlockPropertiesPanelProps) {
  return (
    <div className={`flex-1 border-r bg-background ${selectedBlock ? 'overflow-y-auto pb-10' : 'overflow-hidden'}`}>
      {selectedBlock ? (
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
                title={selectedBlock.content?.title}
                subtitle={selectedBlock.content?.subtitle}
                displayMode={selectedBlock.content?.displayMode}
                columns={selectedBlock.content?.columns}
                itemsToShow={selectedBlock.content?.itemsToShow}
                sortBy={selectedBlock.content?.sortBy}
                sortOrder={selectedBlock.content?.sortOrder}
                showImage={selectedBlock.content?.showImage}
                showTitle={selectedBlock.content?.showTitle}
                showExcerpt={selectedBlock.content?.showExcerpt}
                onTitleChange={(v) => updateBlockContent(selectedBlock.id, { content: { ...selectedBlock.content, title: v } })}
                onSubtitleChange={(v) => updateBlockContent(selectedBlock.id, { content: { ...selectedBlock.content, subtitle: v } })}
                onDisplayModeChange={(v) => updateBlockContent(selectedBlock.id, { content: { ...selectedBlock.content, displayMode: v } })}
                onColumnsChange={(v) => updateBlockContent(selectedBlock.id, { content: { ...selectedBlock.content, columns: v } })}
                onItemsToShowChange={(v) => updateBlockContent(selectedBlock.id, { content: { ...selectedBlock.content, itemsToShow: v } })}
                onSortByChange={(v) => updateBlockContent(selectedBlock.id, { content: { ...selectedBlock.content, sortBy: v } })}
                onSortOrderChange={(v) => updateBlockContent(selectedBlock.id, { content: { ...selectedBlock.content, sortOrder: v } })}
                onShowImageChange={(v) => updateBlockContent(selectedBlock.id, { content: { ...selectedBlock.content, showImage: v } })}
                onShowTitleChange={(v) => updateBlockContent(selectedBlock.id, { content: { ...selectedBlock.content, showTitle: v } })}
                onShowExcerptChange={(v) => updateBlockContent(selectedBlock.id, { content: { ...selectedBlock.content, showExcerpt: v } })}
              />
            )}
        </AdminLayout>
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
                ...site.settings, // preserve favicon and others
                navigation: siteBlocks?.navigation,
                footer: siteBlocks?.footer,
                show_featured_image: siteBlocks?.show_featured_image
              }
            } : undefined}
            className="h-full"
            blocksLoading={blocksLoading}
            allBlocks={(currentPost?.blocks || []) as any}
            onSelectBlock={onSelectBlock}
          />
        </div>
      )}
    </div>
  )
}