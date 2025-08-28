import { SiteLayout } from "@/components/frontend/layout/site-layout"
import { AnimationProvider } from "@/contexts/animation-context"
import type { SiteWithBlocks } from "@/lib/actions/pages/page-frontend-actions"

interface PostBlockRendererProps {
  site: SiteWithBlocks
  post: {
    id: string
    title: string
    slug: string
    meta_description?: string | null
    site_id: string
    featured_image?: string | null
    excerpt?: string | null
    is_published: boolean
    blocks: Array<{
      id: string
      type: string
      content: Record<string, any>
      display_order: number
    }>
  }
}

export function PostBlockRenderer({ site, post }: PostBlockRendererProps) {
  const { blocks: siteBlocks = [] } = site
  const { blocks: postBlocks = [] } = post
  
  // Sort post blocks by display_order
  const sortedBlocks = postBlocks.sort((a, b) => a.display_order - b.display_order)
  
  // Find navigation and footer from site blocks
  const navigationBlock = siteBlocks.find((block: any) => block.type === 'navigation')
  const footerBlock = siteBlocks.find((block: any) => block.type === 'footer')
  
  // Get animation settings from site settings
  const animationSettings = site.settings?.animations || {
    enabled: false,
    preset: 'fade',
    duration: 0.6,
    stagger: 0.1,
    intensity: 'medium'
  }

  return (
    <AnimationProvider settings={animationSettings}>
      <SiteLayout navigation={navigationBlock?.content} footer={footerBlock?.content} site={site}>
      
      {/* Post Header */}
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">
            {post.title}
          </h1>
          {post.excerpt && (
            <p className="text-xl text-muted-foreground">
              {post.excerpt}
            </p>
          )}
        </div>

        {/* Post Content Blocks */}
        <div className="prose prose-lg max-w-none">
          {sortedBlocks.map((block, index) => (
        <div key={`${block.type}-${index}`}>
          {block.type === 'rich-text' && (
            <div className="space-y-2">
              {block.content.title && (
                <h3 className="text-2xl font-bold">{block.content.title}</h3>
              )}
              {block.content.body && (
                <div 
                  className="prose prose-lg max-w-none"
                  dangerouslySetInnerHTML={{ __html: block.content.body }}
                />
              )}
            </div>
          )}
          
          {block.type === 'image' && (
            <div className="my-6">
              {block.content.url && (
                <img 
                  src={block.content.url} 
                  alt={block.content.alt || ''} 
                  className="w-full h-auto rounded-lg"
                />
              )}
              {block.content.caption && (
                <p className="text-center text-sm text-muted-foreground mt-2">
                  {block.content.caption}
                </p>
              )}
            </div>
          )}
          
          {block.type === 'code' && (
            <pre className="bg-muted p-4 rounded-lg overflow-x-auto">
              <code className={`language-${block.content.language || 'javascript'}`}>
                {block.content.code}
              </code>
            </pre>
          )}
          
          {block.type === 'quote' && (
            <blockquote className="border-l-4 border-primary pl-4 my-6 italic">
              <p className="text-lg">{block.content.text}</p>
              {(block.content.author || block.content.source) && (
                <cite className="text-sm text-muted-foreground not-italic">
                  {block.content.author && `— ${block.content.author}`}
                  {block.content.source && `, ${block.content.source}`}
                </cite>
              )}
            </blockquote>
          )}
          
            {block.type === 'post-content' && (
              <div className="space-y-2">
                {block.content.content && (
                  <div 
                    className="prose prose-lg max-w-none"
                    dangerouslySetInnerHTML={{ __html: block.content.content }}
                  />
                )}
              </div>
            )}

            {block.type === 'divider' && (
              <hr className="my-8 border-t border-border" />
            )}
          </div>
        ))}
        </div>
      </div>
      
      </SiteLayout>
    </AnimationProvider>
  )
}