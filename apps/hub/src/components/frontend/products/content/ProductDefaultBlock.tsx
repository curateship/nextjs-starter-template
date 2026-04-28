import { BlockContainer } from '@/components/frontend/layout/block-container'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Download } from 'lucide-react'
import { sanitizeRichHtml } from '@/lib/utils/html-sanitizer'

interface ProductDefaultBlockProps {
  title?: string
  richText?: string
  featuredImage?: string
  downloadButtonText?: string
  downloadButtonStyle?: string
  downloadButtonUrl?: string
  siteWidth?: 'full' | 'custom'
  customWidth?: number
}

const ProductDefaultBlock = ({
  title,
  richText,
  featuredImage,
  downloadButtonText,
  downloadButtonStyle = 'black',
  downloadButtonUrl,
  siteWidth = 'custom',
  customWidth
}: ProductDefaultBlockProps) => {
  return (
    <BlockContainer id="product-default" className="white" siteWidth={siteWidth} customWidth={customWidth}>
      <div className="max-w-6xl mx-auto">
        <div className="grid md:grid-cols-2 gap-8 lg:gap-12 items-start">
          {/* Image Column */}
          <div className="space-y-6">
            {featuredImage ? (
              <div className="rounded-2xl overflow-hidden bg-muted shadow-sm">
                <img
                  src={featuredImage}
                  alt={title || 'Product image'}
                  className="w-full h-auto"
                />
              </div>
            ) : (
              <div className="aspect-square rounded-2xl bg-muted/50 flex items-center justify-center">
                <div className="text-center text-muted-foreground">
                  <div className="text-lg font-medium mb-2">No featured image</div>
                  <div className="text-sm">Add an image in the product settings</div>
                </div>
              </div>
            )}

            {/* Download Button - Under Image */}
            {downloadButtonText && downloadButtonUrl && (
              <div className="flex justify-center pt-4">
                {downloadButtonStyle === 'black' ? (
                  <a 
                    href={downloadButtonUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 bg-black text-white hover:bg-gray-800 h-10 px-6 py-2 rounded-md text-sm font-medium transition-all shadow-xs"
                  >
                    <Download className="h-5 w-5" />
                    {downloadButtonText}
                  </a>
                ) : (
                  <Button
                    variant={downloadButtonStyle as any}
                    size="lg"
                    className="gap-2"
                    asChild
                  >
                    <a href={downloadButtonUrl} target="_blank" rel="noopener noreferrer">
                      <Download className="h-5 w-5" />
                      {downloadButtonText}
                    </a>
                  </Button>
                )}
              </div>
            )}
          </div>

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
                dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(richText) }}
              />
            )}
          </div>
        </div>
      </div>
    </BlockContainer>
  )
}

export { ProductDefaultBlock }
