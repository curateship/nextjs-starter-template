import { format } from "date-fns"
import { Avatar } from "@/components/ui/avatar"
import Image from "next/image"
import type { PostContentStyleRendererProps } from "./index"

const defaultAuthor = {
  name: "Author",
  image: "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/avatar-2.webp"
}

export function DefaultPostContentRenderer({ config, sharedContent }: PostContentStyleRendererProps) {
  const alignment = config.alignment || 'center'
  const contentMaxWidth = config.contentMaxWidth as number | undefined
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
    <div
      className={`flex flex-col ${isCenter ? 'items-center text-center' : 'items-start text-left'} gap-4 w-full`}
      style={contentMaxWidth ? { maxWidth: `${contentMaxWidth}px` } : undefined}
    >
      <h1 className={`text-pretty ${titleClasses} font-semibold`}>
        {title}
      </h1>
      {excerpt && (
        <h3 className="text-muted-foreground text-lg md:text-xl">
          {excerpt}
        </h3>
      )}
      {(showAuthor || showDate) && createdAt && (
        <div className="flex items-center gap-3 text-sm md:text-base">
          {showAuthor && (
            <Avatar className="h-8 w-8 border">
              <Image
                src={defaultAuthor.image}
                alt={defaultAuthor.name}
                fill
                sizes="32px"
                className="object-cover rounded-full"
              />
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
        <div className="relative mt-4 aspect-video w-full rounded-lg border overflow-hidden">
          <Image
            src={featuredImage}
            alt="Featured image"
            fill
            sizes="(max-width: 768px) 100vw, 800px"
            className="object-cover"
          />
        </div>
      )}
      {body && (
        <div
          className="prose dark:prose-invert max-w-none w-full mt-6"
        >
          <div className="text-lg text-gray-600 dark:text-gray-400" dangerouslySetInnerHTML={{ __html: body }} />
        </div>
      )}
    </div>
  )
}
