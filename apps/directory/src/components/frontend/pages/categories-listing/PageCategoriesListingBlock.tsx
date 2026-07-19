"use client"

import { useEffect, useState } from "react"
import Link from "@/components/app-link"
import { Badge } from "@/components/ui/badge"
import { BlockContainer } from "@/components/frontend/layout/block-container"
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
        <div className="flex flex-wrap gap-2 md:gap-3">
          {categories.map((category) => (
            <Badge
              key={category.id}
              asChild
              variant="outline"
              className="rounded-full px-3 py-1.5 text-xs font-medium md:px-4 md:text-sm"
            >
              <Link href={`/categories/${category.slug}`}>
                {category.title}
              </Link>
            </Badge>
          ))}
        </div>
      )}
    </BlockContainer>
  )
}
