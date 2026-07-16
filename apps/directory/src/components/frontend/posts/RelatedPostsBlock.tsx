"use client"

import { useEffect, useState } from "react"
import Link from "@/components/app-link"
import Image from "@/components/app-image"
import { getRelatedPostsData, type RelatedPostsData } from "@/lib/actions/posts/related-posts-actions"

interface RelatedPostsBlockProps {
  content: {
    title?: string
    subtitle?: string
    displayMode?: 'grid' | 'list'
    columns?: number
    itemsToShow?: number
    sortBy?: 'date' | 'title'
    sortOrder?: 'asc' | 'desc'
    visibility?: Record<string, boolean>
  }
  siteId: string
  currentPostId: string
  preloadedData?: RelatedPostsData | null
}

export function RelatedPostsBlock({ content, siteId, currentPostId, preloadedData }: RelatedPostsBlockProps) {
  const [data, setData] = useState<RelatedPostsData | null>(preloadedData || null)
  const [loading, setLoading] = useState(!preloadedData)

  const {
    title = 'Related Posts',
    subtitle = '',
    displayMode = 'grid',
    columns = 3,
    itemsToShow = 3,
    sortBy = 'date',
    sortOrder = 'desc',
    visibility,
  } = content
  const showImage = visibility?.showImage !== false
  const showTitle = visibility?.showTitle !== false
  const showExcerpt = visibility?.showExcerpt !== false

  useEffect(() => {
    if (preloadedData) {
      setData(preloadedData)
      setLoading(false)
      return
    }

    async function loadData() {
      setLoading(true)
      const result = await getRelatedPostsData({
        siteId,
        excludePostId: currentPostId,
        sortBy,
        sortOrder,
        limit: itemsToShow,
      })

      if (result.success && result.data) {
        setData(result.data)
      }
      setLoading(false)
    }

    loadData()
  }, [siteId, currentPostId, sortBy, sortOrder, itemsToShow, preloadedData])

  const gridColumns = displayMode === 'grid'
    ? `grid-cols-1 sm:grid-cols-2 lg:grid-cols-${columns}`
    : 'grid-cols-1'

  if (loading && !data) {
    return (
      <div className="my-12">
        {title && <h2 className="text-3xl font-bold mb-2">{title}</h2>}
        {subtitle && <p className="text-lg text-muted-foreground mb-8">{subtitle}</p>}
        <div className={`grid ${gridColumns} gap-4 md:gap-8`}>
          {Array.from({ length: itemsToShow }, (_, i) => (
            <div key={i} className="animate-pulse">
              {showImage && <div className="bg-muted rounded-md aspect-video mb-4"></div>}
              {showTitle && <div className="h-6 bg-muted rounded w-3/4 mb-2"></div>}
              {showExcerpt && <div className="h-4 bg-muted rounded w-full"></div>}
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (!data || data.posts.length === 0) {
    return null
  }

  return (
    <div className="my-12">
      {title && <h2 className="text-3xl font-bold mb-2">{title}</h2>}
      {subtitle && <p className="text-lg text-muted-foreground mb-8">{subtitle}</p>}
      {!title && !subtitle && <div className="mb-8" />}

      <div className={`grid ${gridColumns} gap-4 md:gap-8`}>
        {data.posts.map((post, index) => (
          <Link
            key={post.id}
            href={`/posts/${post.slug}`}
            className="block hover:opacity-75 transition-opacity"
          >
            <div className={displayMode === 'list' ? 'flex gap-6' : 'flex flex-col gap-2'}>
              {showImage && (
                <div className={displayMode === 'list' ? 'w-48 flex-shrink-0' : ''}>
                  {post.featured_image ? (
                    <div className="relative rounded-md aspect-video overflow-hidden">
                      <Image
                        src={post.featured_image}
                        alt={post.title || 'Post image'}
                        fill
                        className="object-cover"
                        sizes="(max-width: 640px) 384px, (max-width: 1024px) 50vw, 384px"
                        loading={index < columns ? "eager" : "lazy"}
                      />
                    </div>
                  ) : (
                    <div className="bg-muted rounded-md aspect-video flex items-center justify-center text-muted-foreground">
                      No Image
                    </div>
                  )}
                </div>
              )}
              <div className="flex flex-col gap-1">
                {showTitle && (
                  <h3 className="text-xl tracking-tight pt-3">{post.title}</h3>
                )}
                {showExcerpt && post.excerpt && (
                  <p className="text-muted-foreground text-base py-2">
                    {post.excerpt.length > 150
                      ? post.excerpt.substring(0, 150) + '...'
                      : post.excerpt}
                  </p>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
