import type { CategoryContentStyleRendererProps } from "./index"

export function DefaultCategoryContentRenderer({ config, sharedContent }: CategoryContentStyleRendererProps) {
  const alignment = config.alignment || 'center'
  const contentMaxWidth = config.contentMaxWidth as number | undefined
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

  const htmlContent = body || description

  return (
    <div
      className={`flex flex-col ${isCenter ? 'items-center text-center' : 'items-start text-left'} gap-4 w-full`}
      style={contentMaxWidth ? { maxWidth: `${contentMaxWidth}px` } : undefined}
    >
      <h1 className={`text-pretty ${titleClasses} font-semibold`}>
        {title}
      </h1>
      {featuredImage && showFeaturedImage && (
        <img
          src={featuredImage}
          alt={title || 'Category image'}
          className="mt-4 aspect-video w-full rounded-lg border object-cover"
        />
      )}
      {htmlContent && (
        <div
          className="prose dark:prose-invert max-w-none w-full mt-6"
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
