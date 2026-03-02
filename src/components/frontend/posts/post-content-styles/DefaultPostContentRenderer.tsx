import { format } from "date-fns"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import type { PostContentStyleRendererProps } from "./index"

const defaultAuthor = {
  name: "Author",
  image: "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/avatar-2.webp"
}

export function DefaultPostContentRenderer({ config, sharedContent }: PostContentStyleRendererProps) {
  const alignment = config.alignment || 'center'
  const contentMaxWidth = config.contentMaxWidth ?? 768
  const titleSize = config.titleSize || 'large'

  const {
    title,
    excerpt,
    featuredImage,
    showFeaturedImage,
    createdAt,
    showAuthor = true,
    showDate = true,
    body,
  } = sharedContent

  const isCenter = alignment === 'center'

  const titleSizeMap: Record<string, string> = {
    'medium': 'text-3xl md:text-4xl',
    'large': 'text-4xl md:text-5xl',
    'extra-large': 'text-5xl md:text-6xl',
  }
  const titleClasses = titleSizeMap[titleSize] || 'text-4xl md:text-5xl'

  return (
    <div className={`flex flex-col ${isCenter ? 'items-center text-center' : 'items-start text-left'} gap-4`}>
      <h1 className={`max-w-3xl text-pretty ${titleClasses} font-semibold`}>
        {title}
      </h1>
      {excerpt && (
        <h3 className="text-muted-foreground max-w-3xl text-lg md:text-xl">
          {excerpt}
        </h3>
      )}
      {(showAuthor || showDate) && createdAt && (
        <div className="flex items-center gap-3 text-sm md:text-base">
          {showAuthor && (
            <Avatar className="h-8 w-8 border">
              <AvatarImage src={defaultAuthor.image} />
              <AvatarFallback>{defaultAuthor.name.charAt(0)}</AvatarFallback>
            </Avatar>
          )}
          <span>
            {showAuthor && (
              <a href="#" className="font-semibold">
                {defaultAuthor.name}
              </a>
            )}
            {showDate && (
              <span className={showAuthor ? "ml-1" : ""}>
                {showAuthor ? "on " : ""}{format(new Date(createdAt), "MMMM d, yyyy")}
              </span>
            )}
          </span>
        </div>
      )}
      {featuredImage && showFeaturedImage !== false && (
        <img
          src={featuredImage}
          alt="Featured image"
          className="mt-4 aspect-video w-full rounded-lg border object-cover"
        />
      )}
      {body && (
        <div
          className={`prose dark:prose-invert w-full mt-6 ${isCenter ? '' : ''}`}
          style={{ maxWidth: `${contentMaxWidth}px` }}
        >
          <div className={`text-lg text-gray-600 dark:text-gray-400 ${isCenter ? '' : ''}`} dangerouslySetInnerHTML={{ __html: body }} />
        </div>
      )}
    </div>
  )
}
