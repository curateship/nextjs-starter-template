interface PostBlock {
  id: string
  type: string
  title: string
  content: Record<string, any>
}

interface Post {
  id: string
  title: string
  slug: string
  meta_description?: string | null
  site_id: string
  featured_image?: string | null
  excerpt?: string | null
  is_published: boolean
}

interface Site {
  id: string
  name: string
  subdomain: string
}

interface PostPreviewProps {
  blocks: PostBlock[]
  post?: Post
  site?: Site
  siteBlocks?: {
    navigation?: any
    footer?: any
  } | null
  className?: string
  blocksLoading?: boolean
}

export function PostPreview({
  blocks,
  post,
  site,
  siteBlocks,
  className = "",
  blocksLoading = false
}: PostPreviewProps) {
  if (blocksLoading) {
    return (
      <div className={`flex items-center justify-center ${className}`}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading preview...</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`bg-white border rounded-lg overflow-hidden ${className}`}>
      <div className="p-6">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold mb-2">
            {post?.title || 'Post Preview'}
          </h1>
          <p className="text-muted-foreground text-sm">
            Preview mode - select a block to edit
          </p>
        </div>

        {blocks.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground mb-2">No blocks added yet</p>
            <p className="text-sm text-muted-foreground">
              Add blocks from the right sidebar to start building your post
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {blocks.map((block) => (
              <div key={block.id} className="border rounded-lg p-4">
                <div className="text-sm text-muted-foreground mb-2">
                  {block.title}
                </div>
                <div className="text-sm">
                  {/* Mock preview content */}
                  {block.type === 'post-content' && (
                    <div className="prose max-w-none">
                      <div className="whitespace-pre-wrap">
                        {block.content.content || 'Content block preview...'}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}