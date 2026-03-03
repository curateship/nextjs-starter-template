import { Button } from "@/components/ui/button"
import { Download } from "lucide-react"
import type { ProductContentStyleRendererProps } from "./index"

export function DefaultProductContentRenderer({ config, sharedContent }: ProductContentStyleRendererProps) {
  const alignment = config.alignment || 'left'
  const contentMaxWidth = config.contentMaxWidth as number | undefined
  const titleSize = config.titleSize || 'large'

  const {
    title,
    description,
    featuredImage,
    showFeaturedImage = true,
    downloadButtonText,
    downloadButtonStyle = 'black',
    downloadButtonUrl,
    body,
  } = sharedContent

  const titleSizeMap: Record<string, string> = {
    'medium': 'text-3xl md:text-4xl',
    'large': 'text-4xl md:text-5xl',
    'extra-large': 'text-5xl md:text-6xl',
  }
  const titleClasses = titleSizeMap[titleSize] || 'text-4xl md:text-5xl'

  const richText = body || description

  return (
    <div
      className="w-full"
      style={contentMaxWidth ? { maxWidth: `${contentMaxWidth}px`, margin: '0 auto' } : undefined}
    >
      <div className={`grid ${featuredImage && showFeaturedImage ? 'md:grid-cols-2' : ''} gap-8 lg:gap-12 items-start`}>
        {/* Image Column */}
        {featuredImage && showFeaturedImage && (
          <div className="space-y-6">
            <div className="rounded-2xl overflow-hidden bg-muted shadow-sm">
              <img
                src={featuredImage}
                alt={title || 'Product image'}
                className="w-full h-auto"
              />
            </div>

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
        )}

        {/* Content Column */}
        <div className={`space-y-6 ${alignment === 'center' ? 'text-center' : 'text-left'}`}>
          {title && (
            <h1 className={`${titleClasses} font-bold tracking-tight`}>
              {title}
            </h1>
          )}

          {richText && (
            <div
              className="prose prose-lg max-w-none text-muted-foreground"
              dangerouslySetInnerHTML={{ __html: richText }}
            />
          )}

          {/* Download Button - inline when no image */}
          {(!featuredImage || !showFeaturedImage) && downloadButtonText && downloadButtonUrl && (
            <div className={`pt-4 ${alignment === 'center' ? 'flex justify-center' : ''}`}>
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
      </div>
    </div>
  )
}
