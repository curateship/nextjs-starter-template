import { sanitizeRichMediaHtml } from "@/lib/utils/html-sanitizer"
import { cn } from "@/lib/utils"

interface CategoryCoreBlockProps {
  content?: {
    body?: string
    imageWidth?: number
    visibility?: Record<string, boolean>
  }
  category: {
    title?: string | null
    featured_image?: string | null
  }
  siteWidth?: 'full' | 'custom'
  customWidth?: number
}

// R2 media is served through the authenticated proxy (no public CORS)
function resolveMediaUrl(url?: string | null) {
  const trimmedUrl = url?.trim() || ""
  if (!trimmedUrl) return ""

  if (trimmedUrl.startsWith("r2://")) {
    return `/api/media/proxy?url=${encodeURIComponent(trimmedUrl)}`
  }

  return trimmedUrl
}

// Category page header: featured image on the left, title + rich text on the
// right (stacked on mobile). Title/image come from the category row; the rich
// text body is the per-category block value.
export function CategoryCoreBlock({ content, category, siteWidth = 'custom', customWidth }: CategoryCoreBlockProps) {
  const visibility = content?.visibility && typeof content.visibility === "object" ? content.visibility : {}

  if (visibility.hideBlock === true) return null

  const title = visibility.title !== false ? (category.title || "") : ""
  const featuredImage = visibility.image !== false ? resolveMediaUrl(category.featured_image) : ""
  const body = visibility.body !== false && typeof content?.body === "string"
    ? sanitizeRichMediaHtml(content.body)
    : ""

  if (!title && !featuredImage && !body.trim()) return null

  const containerStyle = siteWidth === 'custom'
    ? { maxWidth: `${customWidth || 1152}px` }
    : undefined

  // Template-owned image column width as a % of the row (desktop only)
  const imageWidthNumber = Number(content?.imageWidth)
  const imageWidth = Number.isFinite(imageWidthNumber) && imageWidthNumber > 0
    ? Math.min(90, Math.max(10, imageWidthNumber))
    : 40

  return (
    <div
      className={cn("px-6 py-6", siteWidth === 'custom' && "mx-auto")}
      style={containerStyle}
    >
      <div
        className={cn("grid items-start gap-6 md:gap-10", featuredImage && "md:grid-cols-[var(--core-image-width)_minmax(0,1fr)]")}
        style={featuredImage ? { "--core-image-width": `${imageWidth}%` } as React.CSSProperties : undefined}
      >
        {featuredImage ? (
          <img
            src={featuredImage}
            alt={title || "Category image"}
            className="h-auto w-full rounded-xl object-cover"
          />
        ) : null}

        <div className="min-w-0">
          {title ? (
            <h1 className="text-3xl font-semibold leading-tight tracking-normal text-foreground md:text-4xl">{title}</h1>
          ) : null}

          {body.trim() ? (
            <div
              className={cn(
                "prose prose-neutral dark:prose-invert max-w-none [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-xl",
                title && "mt-4"
              )}
              dangerouslySetInnerHTML={{ __html: body }}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}
