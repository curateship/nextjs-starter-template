import type { PostBlock } from '@/lib/actions/posts/post-actions'

interface PostBlockRendererProps {
  blocks: Record<string, PostBlock>
}

export function PostBlockRenderer({ blocks }: PostBlockRendererProps) {
  // Sort blocks by display_order
  const sortedBlocks = Object.values(blocks).sort((a, b) => a.display_order - b.display_order)

  return (
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
          
          {block.type === 'divider' && (
            <hr className="my-8 border-t border-border" />
          )}
        </div>
      ))}
    </div>
  )
}