import { BlockContainer } from '@/components/ui/block-container'
import { useEffect, useState } from 'react'

interface ProductDefaultBlockProps {
  title?: string
  richText?: string
  featuredImage?: string
}

const ProductDefaultBlock = ({
  title,
  richText,
  featuredImage
}: ProductDefaultBlockProps) => {
  const [sanitizedContent, setSanitizedContent] = useState('')

  useEffect(() => {
    const sanitizeContent = async () => {
      if (richText) {
        if (typeof window !== 'undefined') {
          // Client-side: use DOMPurify
          try {
            const DOMPurify = (await import('dompurify')).default
            setSanitizedContent(DOMPurify.sanitize(richText))
          } catch (error) {
            console.warn('Failed to load DOMPurify, using raw content:', error)
            setSanitizedContent(richText)
          }
        } else {
          // Server-side: use raw content (will be sanitized on client)
          setSanitizedContent(richText)
        }
      } else {
        setSanitizedContent('')
      }
    }
    
    sanitizeContent()
  }, [richText])

  return (
    <BlockContainer className="white">
      <div className="max-w-6xl mx-auto">
        <div className="grid md:grid-cols-2 gap-8 lg:gap-12 items-center">
          {/* Content Column */}
          <div className="space-y-6">
            {title && (
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight">
                {title}
              </h1>
            )}
            
            {sanitizedContent && (
              <div 
                className="prose prose-lg max-w-none text-muted-foreground"
                dangerouslySetInnerHTML={{ __html: sanitizedContent }}
              />
            )}
          </div>

          {/* Image Column */}
          {featuredImage && (
            <div className="relative">
              <div className="aspect-square rounded-2xl overflow-hidden bg-muted">
                <img
                  src={featuredImage}
                  alt={title || 'Product image'}
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          )}
        </div>

        {/* Fallback for no image */}
        {!featuredImage && (
          <div className="mt-8">
            <div className="aspect-video rounded-2xl bg-muted/50 flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <div className="text-lg font-medium mb-2">No featured image</div>
                <div className="text-sm">Add an image in the product settings</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </BlockContainer>
  )
}

export { ProductDefaultBlock }