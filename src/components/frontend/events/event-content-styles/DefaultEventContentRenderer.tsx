import type { EventContentStyleRendererProps } from "./index"

export function DefaultEventContentRenderer({ config, sharedContent }: EventContentStyleRendererProps) {
  const alignment = config.alignment || 'center'
  const contentMaxWidth = config.contentMaxWidth ?? 768
  const titleSize = config.titleSize || 'large'

  const {
    title,
    description,
    featuredImage,
    showFeaturedImage = true,
    body,
  } = sharedContent

  const isCenter = alignment === 'center'

  const titleSizeMap: Record<string, string> = {
    'medium': 'text-3xl md:text-4xl',
    'large': 'text-4xl md:text-5xl',
    'extra-large': 'text-5xl md:text-6xl',
  }
  const titleClasses = titleSizeMap[titleSize] || 'text-4xl md:text-5xl'

  // Use body from block content, fall back to event description
  const htmlContent = body || description

  return (
    <div className={`flex flex-col ${isCenter ? 'items-center text-center' : 'items-start text-left'} gap-4`}>
      <h1 className={`max-w-3xl text-pretty ${titleClasses} font-semibold`}>
        {title}
      </h1>
      {featuredImage && showFeaturedImage && (
        <img
          src={featuredImage}
          alt={title || 'Event image'}
          className="mt-4 aspect-video w-full rounded-lg border object-cover"
        />
      )}
      {htmlContent && (
        <div
          className="prose dark:prose-invert w-full mt-6"
          style={{ maxWidth: `${contentMaxWidth}px` }}
        >
          <div
            className={`text-lg text-gray-600 dark:text-gray-400`}
            dangerouslySetInnerHTML={{ __html: htmlContent }}
          />
        </div>
      )}
    </div>
  )
}
