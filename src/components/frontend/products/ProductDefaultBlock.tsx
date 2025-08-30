import { BlockContainer } from '@/components/ui/block-container'
import Image from 'next/image'

interface ProductDefaultBlockProps {
  title?: string
  richText?: string
  featuredImage?: string
  siteWidth?: 'full' | 'custom'
  customWidth?: number
}

const ProductDefaultBlock = ({
  title,
  richText,
  featuredImage,
  siteWidth = 'custom',
  customWidth
}: ProductDefaultBlockProps) => {
  return (
    <BlockContainer id="product-default" className="white" siteWidth={siteWidth} customWidth={customWidth}>
      <div className="max-w-6xl mx-auto">
        <div className="grid md:grid-cols-2 gap-8 lg:gap-12 items-center">
          {/* Content Column */}
          <div className="space-y-6">
            {title && (
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight">
                {title}
              </h1>
            )}
            
            {richText && (
              <div 
                className="prose prose-lg max-w-none text-muted-foreground"
                dangerouslySetInnerHTML={{ __html: richText }}
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