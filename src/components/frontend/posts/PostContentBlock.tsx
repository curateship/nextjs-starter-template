import { format } from "date-fns"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { BlockContainer } from "@/components/frontend/layout/block-container"

interface PostContentBlockProps {
  blocks: Array<{
    type: string
    content: Record<string, any>
  }>
  post: {
    title: string
    excerpt?: string | null
    featured_image?: string | null
    created_at: string
  }
  siteWidth?: 'full' | 'custom'
  customWidth?: number
}

export function PostContentBlock({ 
  blocks,
  post,
  siteWidth = 'custom', 
  customWidth 
}: PostContentBlockProps) {
  // Default author info (you can enhance this later to get from post data)
  const defaultAuthor = {
    name: "Author",
    image: "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/avatar-2.webp"
  }

  return (
    <BlockContainer
      siteWidth={siteWidth}
      customWidth={customWidth}
    >
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 text-center">
          <h1 className="max-w-3xl text-pretty text-5xl font-semibold md:text-6xl">
            {post.title}
          </h1>
          {post.excerpt && (
            <h3 className="text-muted-foreground max-w-3xl text-lg md:text-xl">
              {post.excerpt}
            </h3>
          )}
          <div className="flex items-center gap-3 text-sm md:text-base">
            <Avatar className="h-8 w-8 border">
              <AvatarImage src={defaultAuthor.image} />
              <AvatarFallback>{defaultAuthor.name.charAt(0)}</AvatarFallback>
            </Avatar>
            <span>
              <a href="#" className="font-semibold">
                {defaultAuthor.name}
              </a>
              <span className="ml-1">on {format(new Date(post.created_at), "MMMM d, yyyy")}</span>
            </span>
          </div>
          {post.featured_image && (
            <img
              src={post.featured_image}
              alt="Featured image"
              className="mt-4 aspect-video w-full rounded-lg border object-cover"
            />
          )}
        </div>
        
        <div className="prose dark:prose-invert mx-auto max-w-3xl mt-10">
          {blocks.map((block, index) => (
            <div key={index}>
              {block.type === 'rich-text' && (
                <>
                  {block.content.title && (
                    <h2 className="text-4xl font-extrabold">{block.content.title}</h2>
                  )}
                  {block.content.body && (
                    <div className="text-lg text-gray-600 dark:text-gray-400" dangerouslySetInnerHTML={{ __html: block.content.body }} />
                  )}
                </>
              )}
              
              {block.type === 'image' && block.content.url && (
                <div className="my-8">
                  <img 
                    src={block.content.url} 
                    alt={block.content.alt || ''} 
                    className="aspect-video w-full rounded-md object-cover"
                  />
                  {block.content.caption && (
                    <p className="text-center text-sm text-muted-foreground mt-2">
                      {block.content.caption}
                    </p>
                  )}
                </div>
              )}
              
              {block.type === 'code' && block.content.code && (
                <pre className="bg-muted p-4 rounded-lg overflow-x-auto">
                  <code className={`language-${block.content.language || 'javascript'}`}>
                    {block.content.code}
                  </code>
                </pre>
              )}
              
              {block.type === 'quote' && block.content.text && (
                <blockquote>
                  &ldquo;{block.content.text}&rdquo;
                  {(block.content.author || block.content.source) && (
                    <cite className="text-sm text-muted-foreground not-italic block mt-2">
                      {block.content.author && `— ${block.content.author}`}
                      {block.content.source && `, ${block.content.source}`}
                    </cite>
                  )}
                </blockquote>
              )}
              
              {block.type === 'post-content' && block.content.content && (
                <div className="text-lg" dangerouslySetInnerHTML={{ __html: block.content.content }} />
              )}

              {block.type === 'divider' && (
                <hr className="my-8 border-t border-border" />
              )}
            </div>
          ))}
        </div>
    </BlockContainer>
  )
}