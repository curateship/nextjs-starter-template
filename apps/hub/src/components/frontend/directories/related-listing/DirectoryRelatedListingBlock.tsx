"use client"

import { useEffect, useState, type HTMLAttributes } from "react"
import Link from "next/link"
import { MapPin } from "lucide-react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { FeaturedBadge } from "@/components/frontend/directories/FeaturedBadge"
import { Rating } from "@/components/shadcnblocks/rating"
import {
  getDirectoryRelatedListingsAction,
  type DirectoryRelatedListingItem,
} from "@/lib/actions/directories/directory-related-listing-actions"
import { resolveMediaUrl } from "@/lib/utils/media-url"

interface DirectoryRelatedListingBlockProps {
  content?: {
    title?: string
    subtitle?: string
    parentCategoryId?: string
    itemsToShow?: number | string
    visibility?: Record<string, boolean>
  }
  siteId: string
  directory: {
    id?: string | null
  }
  isPreview?: boolean
  // Server-prefetched items (pages pattern) — renders with data in the
  // initial HTML instead of client-fetching after hydration
  preloadedItems?: DirectoryRelatedListingItem[]
  cardProps?: HTMLAttributes<HTMLDivElement>
}

const PREVIEW_ITEMS: DirectoryRelatedListingItem[] = [
  {
    id: "preview-related-listing-1",
    title: "Sample Listing",
    slug: "sample-listing",
    featured_image: null,
    meta_description: "A short listing description appears here.",
    rating: 4.8,
    address: "123 Main Street",
    featured: false,
    category: {
      id: "preview-category",
      title: "Sample Category",
      slug: "sample-category",
    },
  },
]

function getShortDescription(value?: string | null) {
  const plainText = (value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
  const words = plainText.split(/\s+/).filter(Boolean)
  return words.length > 18 ? `${words.slice(0, 18).join(" ")}...` : plainText
}

function getRatingValue(value?: number | null) {
  const rating = Number(value)
  if (!Number.isFinite(rating) || rating <= 0) return null
  return Math.min(5, rating)
}

function normalizeItemsToShow(value?: unknown) {
  const numericValue = typeof value === "number"
    ? value
    : typeof value === "string"
      ? Number(value)
      : Number.NaN

  if (!Number.isFinite(numericValue)) return 5

  return Math.min(20, Math.max(1, Math.round(numericValue)))
}

export function DirectoryRelatedListingBlock({
  content,
  siteId,
  directory,
  isPreview = false,
  preloadedItems,
  cardProps,
}: DirectoryRelatedListingBlockProps) {
  const visibility = content?.visibility && typeof content.visibility === "object" ? content.visibility : {}
  const parentCategoryId = typeof content?.parentCategoryId === "string" ? content.parentCategoryId.trim() : ""
  const itemsToShow = normalizeItemsToShow(content?.itemsToShow)
  const title = typeof content?.title === "string" ? content.title.trim() : "Related Listings"
  const subtitle = typeof content?.subtitle === "string" ? content.subtitle.trim() : ""
  const [items, setItems] = useState<DirectoryRelatedListingItem[]>(preloadedItems || [])
  const [loading, setLoading] = useState(false)
  const useTemplatePreviewItems = isPreview && directory.id === "preview"

  useEffect(() => {
    if (useTemplatePreviewItems || !siteId || !directory.id || !parentCategoryId) {
      setItems([])
      return
    }

    // Server-prefetched data — no client fetch needed
    if (preloadedItems) {
      setItems(preloadedItems)
      return
    }

    let cancelled = false
    setLoading(true)
    getDirectoryRelatedListingsAction({
      siteId,
      directoryId: directory.id,
      parentCategoryId,
      limit: itemsToShow,
    })
      .then((result) => {
        if (cancelled) return
        setItems(result.success ? result.data : [])
      })
      .catch(() => {
        if (!cancelled) setItems([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [directory.id, itemsToShow, parentCategoryId, preloadedItems, siteId, useTemplatePreviewItems])

  if (visibility.hideBlock === true) return null
  if (!parentCategoryId || loading) return null

  const relatedItems = useTemplatePreviewItems ? PREVIEW_ITEMS.slice(0, Math.min(itemsToShow, PREVIEW_ITEMS.length)) : items
  if (relatedItems.length === 0) return null

  const showHeader = (visibility.title !== false && title) || (visibility.subtitle !== false && subtitle)
  const { className: cardClassName, ...rootProps } = cardProps || {}

  return (
    <Card {...rootProps} className={cardClassName}>
      {showHeader ? (
        <CardHeader>
          {visibility.title !== false && title ? (
            <h2 className="text-xl font-semibold leading-tight tracking-normal">{title}</h2>
          ) : null}
          {visibility.subtitle !== false && subtitle ? (
            <p className="text-sm leading-6 text-muted-foreground">{subtitle}</p>
          ) : null}
        </CardHeader>
      ) : null}

      {/* grid-cols-1 keeps the rows from widening the card past the viewport on mobile — the truncated address line otherwise sets the grid track's min width */}
      <CardContent className="grid-cols-1 gap-0 p-0">
        <div className="divide-y">
          {relatedItems.map((item) => {
            const href = `/directory/${item.slug}`
            const imageUrl = resolveMediaUrl(item.featured_image)
            const description = visibility.description !== false ? getShortDescription(item.meta_description) : ""
            const rating = visibility.rating !== false ? getRatingValue(item.rating) : null
            const address = visibility.address !== false ? item.address?.trim() : ""
            const category = visibility.category !== false ? item.category : null

            return (
              <div key={item.id} className="flex gap-3 p-4 lg:gap-4">
                {visibility.image !== false ? (
                  <Link
                    href={href}
                    aria-label={item.title}
                    className="block size-20 shrink-0 overflow-hidden rounded-md bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 lg:size-35"
                  >
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt={item.title}
                        loading="lazy"
                        className="h-full w-full object-cover transition-opacity hover:opacity-80"
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                        No Image
                      </span>
                    )}
                  </Link>
                ) : null}

                <div className="min-w-0 flex-1">
                  {item.featured ? <FeaturedBadge className="mb-1" /> : null}
                  {visibility.listingTitle !== false ? (
                    <Link
                      href={href}
                      className="block text-base font-semibold leading-snug hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      {item.title}
                    </Link>
                  ) : null}

                  {description ? (
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
                  ) : null}

                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                    {rating ? (
                      <Rating rate={rating} showScore className="[&_svg]:size-3.5 [&>div]:size-3.5" />
                    ) : null}
                    {address ? (
                      <span className="inline-flex min-w-0 items-center gap-1">
                        <MapPin className="size-3.5 shrink-0 text-foreground" />
                        <span className="min-w-0 truncate">{address}</span>
                      </span>
                    ) : null}
                    {category ? (
                      <span className="rounded-full bg-foreground/5 px-2 py-0.5 text-xs text-muted-foreground">
                        {category.title}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
