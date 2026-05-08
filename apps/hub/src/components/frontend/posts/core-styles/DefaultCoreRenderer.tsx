import { format } from "date-fns"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import Image from "next/image"
import type { CoreStyleRendererProps } from "./index"
import { sanitizeRichHtml } from "@/lib/utils/html-sanitizer"
import { splitSponsorEmbeds } from "@/lib/utils/sponsor-embeds"
import type { SponsorPublic } from "@/lib/actions/sponsors/sponsor-actions"
import { SponsorCard } from "@/components/admin/sponsors/SponsorCard"

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

function SponsorRichTextContent({
  body,
  sponsorsById,
  postId,
}: {
  body: string
  sponsorsById?: Record<string, SponsorPublic>
  postId?: string
}) {
  const parts = splitSponsorEmbeds(body)

  if (!parts.some((part) => part.type === 'sponsor')) {
    return <div className="text-lg text-black dark:text-white" dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(body) }} />
  }

  return (
    <div className="text-lg text-black dark:text-white">
      {parts.map((part, index) => {
        if (part.type === 'html') {
          return (
            <div
              key={`html-${index}`}
              className="contents"
              dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(part.html) }}
            />
          )
        }

        const sponsor = sponsorsById?.[part.sponsorId]
        return sponsor ? <SponsorCard key={`sponsor-${part.sponsorId}-${index}`} sponsor={sponsor} postId={postId} /> : null
      })}
    </div>
  )
}

export function DefaultCoreRenderer({ config, sharedContent, sponsorsById, postId, children }: CoreStyleRendererProps) {
  const alignment = config.alignment || 'center'
  const contentMaxWidth = config.contentMaxWidth as number | undefined
  const titleSize = config.titleSize || 'large'

  const {
    title,
    excerpt,
    featuredImage,
    showFeaturedImage,
    showExcerpt,
    author,
    createdAt,
    showAuthor = true,
    showDate = true,
    body,
  } = sharedContent

  const isCenter = alignment === 'center'
  const authorName = author?.name?.trim()

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
      {showExcerpt !== false && excerpt && (
        <h3 className="text-muted-foreground text-lg md:text-xl">
          {excerpt}
        </h3>
      )}
      {((showAuthor && authorName) || showDate) && createdAt && (
        <div className="flex items-center gap-3 text-sm md:text-base">
          {showAuthor && authorName && (
            <Avatar className="h-8 w-8 border">
              {author?.image && <AvatarImage src={author.image} alt={authorName} />}
              <AvatarFallback className="text-xs font-medium">
                {getInitials(authorName)}
              </AvatarFallback>
            </Avatar>
          )}
          <span>
            {showAuthor && authorName && (
              <span className="font-semibold">
                {authorName}
              </span>
            )}
            {showDate && (
              <span className={showAuthor && authorName ? "ml-1" : ""}>
                {showAuthor && authorName ? "on " : ""}{format(new Date(createdAt), "MMMM d, yyyy")}
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
      {(body || children) && (
        <div
          className="prose dark:prose-invert max-w-none w-full mt-6 [&_h2]:scroll-mt-24"
        >
          {children || (
            <SponsorRichTextContent body={body || ''} sponsorsById={sponsorsById} postId={postId} />
          )}
        </div>
      )}
    </div>
  )
}
