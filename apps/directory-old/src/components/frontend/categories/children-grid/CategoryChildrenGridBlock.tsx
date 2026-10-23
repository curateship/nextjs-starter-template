import Link from "@/components/app-link"
import Image from "@/components/app-image"
import { cn } from "@/lib/utils"
import { resolveMediaUrl } from "@/lib/utils/media-url"
import type { CategoryChildItem } from "@/lib/actions/categories/category-children-actions"

interface CategoryChildrenGridBlockProps {
  content?: {
    title?: string
    columns?: number
    mobileColumns?: number
    imageFit?: "crop" | "fit"
    imageHeight?: number
    visibility?: Record<string, boolean>
  }
  preloadedItems?: CategoryChildItem[]
  siteWidth?: "full" | "custom"
  customWidth?: number
  isPreview?: boolean
}

const PREVIEW_ITEMS: CategoryChildItem[] = [
  { id: "preview-child-1", title: "Downtown", slug: "downtown", featured_image: null },
  { id: "preview-child-2", title: "Midtown", slug: "midtown", featured_image: null },
  { id: "preview-child-3", title: "Uptown", slug: "uptown", featured_image: null },
]

const DESKTOP_COLUMN_CLASS_MAP: Record<number, string> = {
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
}

export function CategoryChildrenGridBlock({
  content,
  preloadedItems,
  siteWidth = "custom",
  customWidth,
  isPreview = false,
}: CategoryChildrenGridBlockProps) {
  const visibility = content?.visibility && typeof content.visibility === "object" ? content.visibility : {}

  if (visibility.hideBlock === true) return null

  const items = isPreview ? PREVIEW_ITEMS : (preloadedItems ?? [])
  if (items.length === 0) return null

  const title = visibility.title !== false ? (content?.title?.trim() ?? "") : ""
  const showImage = visibility.showImage !== false

  const columns = DESKTOP_COLUMN_CLASS_MAP[Number(content?.columns)] ? Number(content?.columns) : 3
  const mobileColumns = Number(content?.mobileColumns) === 2 ? "grid-cols-2" : "grid-cols-1"
  const imageFit = content?.imageFit === "fit" ? "object-contain" : "object-cover"
  const imageFrameClassName = content?.imageFit === "fit" ? "bg-muted" : ""
  const customImageHeight = Number(content?.imageHeight) > 0 ? Number(content?.imageHeight) : undefined
  const imageFrameStyle = customImageHeight ? { aspectRatio: `100 / ${customImageHeight}` } : undefined
  const imageAspectClassName = customImageHeight ? "" : "aspect-video"

  const containerStyle = siteWidth === "custom" ? { maxWidth: `${customWidth || 1152}px` } : undefined

  return (
    <div
      className={cn("px-6 py-6", siteWidth === "custom" && "mx-auto")}
      style={containerStyle}
    >
      {title ? (
        <h2 className="mb-6 text-2xl font-semibold leading-tight tracking-normal">{title}</h2>
      ) : null}

      <div className={cn("grid gap-6", mobileColumns, "sm:grid-cols-2", DESKTOP_COLUMN_CLASS_MAP[columns])}>
        {items.map((item) => {
          const href = `/categories/${item.slug}`
          const imageUrl = showImage ? resolveMediaUrl(item.featured_image) : ""

          return (
            <Link
              key={item.id}
              href={href}
              className="group overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {showImage ? (
                <div
                  className={cn("relative w-full overflow-hidden", imageAspectClassName, imageFrameClassName)}
                  style={imageFrameStyle}
                >
                  {imageUrl ? (
                    <Image
                      src={imageUrl}
                      alt={item.title}
                      fill
                      className={cn(imageFit, "object-center transition-opacity duration-200 group-hover:opacity-75")}
                      sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 33vw"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-muted text-sm text-muted-foreground">
                      No Image
                    </div>
                  )}
                </div>
              ) : null}

              <div className="px-4 py-3">
                <p className="font-semibold leading-snug group-hover:underline">{item.title}</p>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
