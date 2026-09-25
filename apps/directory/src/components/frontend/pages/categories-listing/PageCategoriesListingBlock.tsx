"use client"

import { useEffect, useState } from "react"
import Link from "@/components/app-link"
import { BlockContainer } from "@/components/frontend/layout/block-container"
import { CHIP_CLASS, CHIP_ROW_CLASS, CHIP_SIZE_CLASS } from "@/lib/utils/chip"
import { cn } from "@/lib/utils/tailwind"
import {
  getCategoriesListingData,
  type CategoriesListingData,
} from "@/lib/actions/pages/page-category-listing-actions"

interface PageCategoriesListingBlockProps {
  content?: {
    title?: string
    subtitle?: string
    parentCategoryId?: string
    chipsToShow?: number
    visibility?: Record<string, boolean>
  }
  siteId: string
  preloadedData?: CategoriesListingData
  siteWidth?: "full" | "custom"
  customWidth?: number
}

export function PageCategoriesListingBlock({
  content,
  siteId,
  preloadedData,
  siteWidth = "custom",
  customWidth,
}: PageCategoriesListingBlockProps) {
  const {
    title = "",
    subtitle = "",
    parentCategoryId = "",
    chipsToShow = 20,
    visibility = {},
  } = content || {}
  const [data, setData] = useState<CategoriesListingData | null>(preloadedData || null)
  const [loading, setLoading] = useState(!preloadedData && Boolean(parentCategoryId))
  const limit = Math.min(100, Math.max(1, Number(chipsToShow) || 20))

  useEffect(() => {
    if (!parentCategoryId || !siteId) {
      setData(null)
      setLoading(false)
      return
    }

    if (preloadedData) {
      setData(preloadedData)
      setLoading(false)
      return
    }

    let cancelled = false
    setData(null)
    setLoading(true)
    getCategoriesListingData({ data: { siteId, parentCategoryId, limit } })
      .then((result) => {
        if (!cancelled) setData(result.success && result.data ? result.data : { categories: [] })
      })
      .catch(() => {
        if (!cancelled) setData({ categories: [] })
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [limit, parentCategoryId, preloadedData, siteId])

  if (visibility.hideBlock === true || !parentCategoryId) return null

  const categories = data?.categories || []
  const showTitle = visibility.title !== false && Boolean(title)
  const showSubtitle = visibility.subtitle !== false && Boolean(subtitle)
  const showChips = visibility.chips !== false

  if (!loading && !showTitle && !showSubtitle && (!showChips || categories.length === 0)) {
    return null
  }

  return (
    <BlockContainer
      header={showTitle || showSubtitle
        ? {
            title: showTitle ? title : "",
            subtitle: showSubtitle ? subtitle : "",
            align: "left",
          }
        : undefined}
      siteWidth={siteWidth}
      customWidth={customWidth}
    >
      {showChips && categories.length > 0 && (
        <div className={CHIP_ROW_CLASS}>
          {categories.map((category) => (
            // The same chip as a listing's tags, minus the tick — a tick reads as
            // "this place has this", and these are links you click to browse.
            <Link
              key={category.id}
              href={`/categories/${category.slug}`}
              className={cn(
                CHIP_CLASS,
                CHIP_SIZE_CLASS,
                "transition-colors hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50"
              )}
            >
              {category.title}
            </Link>
          ))}
        </div>
      )}
    </BlockContainer>
  )
}
