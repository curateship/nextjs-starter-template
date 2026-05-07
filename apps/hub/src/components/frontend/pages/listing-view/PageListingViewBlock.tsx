"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { BlockContainer } from "@/components/frontend/layout/block-container"
import { ViewAllButton } from "@/components/ui/view-all-button"
import { getListingViewsData, type ListingViewsData, type ListingViewsItem } from "@/lib/actions/pages/page-listing-views-actions"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Card, CardFooter, CardHeader } from "@/components/ui/card"
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react"

type ListingContentType = 'products' | 'posts'
type ListingStyle = 'default' | 'blog'
type ImageFit = 'crop' | 'fit'

function getInitials(name?: string | null) {
  if (!name) return '?'
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

interface ListingViewsBlockProps {
  content: {
    title?: string
    subtitle?: string
    headerAlign?: 'left' | 'center'
    mobileHeaderAlign?: 'left' | 'center'
    contentType?: ListingContentType
    categoryIds?: string[]
    listingStyle?: ListingStyle
    imageFit?: ImageFit
    displayMode?: 'grid' | 'list'
    itemsToShow?: number
    columns?: number
    sortBy?: 'date' | 'title' | 'display_order'
    sortOrder?: 'asc' | 'desc'
    showImage?: boolean
    showTitle?: boolean
    showDescription?: boolean
    showAuthor?: boolean
    showDate?: boolean
    showReadMore?: boolean
    isPaginated?: boolean
    itemsPerPage?: number
    viewAllText?: string
    viewAllLink?: string
    visibility?: Record<string, boolean>
  }
  siteId: string
  siteSubdomain?: string
  urlPrefixes?: {
    products?: string
    posts?: string
  }
  preloadedData?: any
  siteWidth?: 'full' | 'custom'
  customWidth?: number
}


export function ListingViewsBlock({ content, siteId, siteSubdomain, urlPrefixes, preloadedData, siteWidth = 'custom', customWidth }: ListingViewsBlockProps) {
  const [data, setData] = useState<ListingViewsData | null>(preloadedData || null)
  const [loading, setLoading] = useState(!preloadedData)
  const searchParams = useSearchParams()
  
  // Get current page from URL params
  const currentPage = parseInt(searchParams.get('page') || '1', 10)
  
  // Destructure with defaults
  const {
    title = '',
    subtitle = '',
    headerAlign = 'left',
    mobileHeaderAlign = 'left',
    contentType = 'products',
    categoryIds: rawCategoryIds = [],
    listingStyle = 'default',
    imageFit = 'crop',
    displayMode = 'grid',
    itemsToShow = 6,
    columns = 3,
    sortBy = 'date',
    sortOrder = 'desc',
    showImage = true,
    showTitle = true,
    showDescription = true,
    showAuthor = true,
    showDate = true,
    showReadMore = true,
    isPaginated = false,
    itemsPerPage = 12,
    viewAllText = '',
    viewAllLink = '',
    visibility,
  } = content
  const categoryIds = Array.isArray(rawCategoryIds) ? rawCategoryIds : []
  const categoryIdsKey = categoryIds.join('|')

  // Extract repeated conditions
  const hasViewAll = viewAllText && viewAllLink && !isPaginated
  
  // Create responsive alignment classes
  const getResponsiveAlignmentClass = () => {
    const mobileClass = mobileHeaderAlign === 'center' ? 'text-center' : 'text-left'
    const desktopClass = headerAlign === 'center' ? 'md:text-center' : 'md:text-left'
    return `${mobileClass} ${desktopClass}`
  }

  const getResponsiveMarginClass = () => {
    const mobileClass = mobileHeaderAlign === 'center' ? 'mx-auto' : ''
    const desktopClass = headerAlign === 'center' ? 'md:mx-auto' : mobileHeaderAlign === 'center' ? 'md:mx-0' : ''
    return `${mobileClass} ${desktopClass}`.trim()
  }

  const titleClasses = `text-3xl font-bold md:text-5xl max-w-3xl ${getResponsiveMarginClass()}`
  const subtitleClasses = `mt-2 md:mt-4 text-lg text-muted-foreground max-w-3xl ${getResponsiveMarginClass()}`


  const listingItems = data?.items || data?.products || data?.posts || []
  const emptyMessage = contentType === 'posts'
    ? 'No posts available at the moment.'
    : 'No products available at the moment.'

  // Get URL prefix from props (passed from parent, no API call needed)
  const urlPrefix = urlPrefixes?.[contentType] || contentType

  useEffect(() => {
    async function loadData() {
      // Use preloaded data for initial load if available
      if (preloadedData && currentPage === 1 && !isPaginated) {
        setData(preloadedData)
        setLoading(false)
        return
      }
      
      setLoading(true)
      
      const limit = isPaginated ? itemsPerPage : itemsToShow
      const offset = isPaginated ? (currentPage - 1) * itemsPerPage : 0
      
      const result = await getListingViewsData({
        site_id: siteId,
        contentType,
        categoryIds: categoryIdsKey ? categoryIdsKey.split('|') : [],
        sortBy,
        sortOrder,
        limit,
        offset
      })
      
      if (result.success && result.data) {
        setData(result.data)
      }
      
      setLoading(false)
    }
    
    loadData()
  }, [siteId, contentType, categoryIdsKey, sortBy, sortOrder, itemsToShow, itemsPerPage, isPaginated, currentPage, preloadedData])

  const gridColumns = displayMode === 'grid' 
    ? `grid-cols-1 sm:grid-cols-2 lg:grid-cols-${columns}` 
    : 'grid-cols-1'
  const imageFitClassName = imageFit === 'fit' ? 'object-contain' : 'object-cover'
  const imageFrameClassName = imageFit === 'fit' ? 'bg-muted' : ''

  const formatDate = (value?: string | null) => {
    if (!value) return ''

    return new Intl.DateTimeFormat('en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(value))
  }

  const getItemSummary = (item: ListingViewsItem) => {
    if (!item.richText) return ''

    const plainText = item.richText.replace(/<[^>]*>/g, '').trim()
    return plainText.length > 150
      ? plainText.substring(0, 150) + '...'
      : plainText
  }

  const renderItem = (item: ListingViewsItem, index: number) => {
    // First image in grid is likely LCP element - prioritize it aggressively
    const isLCP = index === 0

    if (listingStyle === 'blog') {
      const href = `/${urlPrefix ? `${urlPrefix}/` : ''}${item.slug}`
      const summary = getItemSummary(item)
      const published = showDate ? formatDate(item.created_at) : ''
      const authorName = item.author?.trim() || ''
      const showAuthorMeta = showAuthor && Boolean(authorName)

      return (
        <Link
          key={item.id}
          href={href}
          className="group block h-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label={`Read ${item.title || (contentType === 'posts' ? 'post' : 'product')}`}
        >
          <Card className="mx-0 grid h-full grid-rows-[auto_auto_1fr_auto] overflow-hidden pt-0 transition-shadow group-hover:shadow-md">
            {showImage && (
              <div className={`aspect-video w-full ${imageFrameClassName}`}>
                {item.featured_image ? (
                  <Image
                    src={item.featured_image}
                    alt={item.title || `${contentType === 'posts' ? 'Post' : 'Product'} image`}
                    width={640}
                    height={360}
                    className={`h-full w-full ${imageFitClassName} object-center transition-opacity duration-200 group-hover:opacity-75`}
                    sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    priority={isLCP}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground">
                    No Image
                  </div>
                )}
              </div>
            )}
            <CardHeader>
              {showTitle && (
                <h3 className="text-xl md:text-xl">
                  {item.title}
                </h3>
              )}
              {showDescription && summary && (
                <p className="my-4 leading-relaxed text-muted-foreground">
                  {summary}
                </p>
              )}
              {(showAuthorMeta || published) && (
                <div className="mt-3 flex items-center gap-2">
                  {showAuthorMeta && (
                    <Avatar className="size-9 border">
                      {item.author_image && <AvatarImage src={item.author_image} alt={authorName} />}
                      <AvatarFallback className="text-xs">{getInitials(authorName)}</AvatarFallback>
                    </Avatar>
                  )}
                  <div className="flex min-w-0 flex-col">
                    {showAuthorMeta && (
                      <span className="text-sm font-semibold text-foreground/80">{authorName}</span>
                    )}
                    {published && (
                      <span className="text-xs text-muted-foreground">{published}</span>
                    )}
                  </div>
                </div>
              )}
            </CardHeader>
            {showReadMore && (
              <CardFooter>
                <span className="flex items-center text-muted-foreground">
                  Read more
                  <ArrowRight className="ml-1 size-4" />
                </span>
              </CardFooter>
            )}
          </Card>
        </Link>
      )
    }

    const itemContent = (
      <div className={displayMode === 'list' ? 'flex gap-6' : 'flex flex-col gap-2'}>
        {showImage && (
          <div className={displayMode === 'list' ? 'w-48 shrink-0' : ''}>
            {item.featured_image ? (
              <div className={`relative rounded-md aspect-square overflow-hidden ${imageFrameClassName}`}>
                <Image
                  src={item.featured_image}
                  alt={item.title || `${contentType === 'posts' ? 'Post' : 'Product'} image`}
                  fill
                  className={imageFitClassName}
                  sizes="(max-width: 640px) 384px, (max-width: 1024px) 50vw, 384px"
                  priority={isLCP}
                  loading={isLCP ? "eager" : (index < columns ? "eager" : "lazy")}
                  fetchPriority={isLCP ? "high" : (index < columns ? "high" : "auto")}
                  onError={(e) => {
                    // Hide broken image via opacity (avoids forced reflow from style.display)
                    (e.target as HTMLElement).style.opacity = '0';
                  }}
                />
              </div>
            ) : (
              <div className="bg-muted rounded-md aspect-square flex items-center justify-center text-muted-foreground">
                No Image
              </div>
            )}
          </div>
        )}
        <div className="flex flex-col gap-2">
          {showTitle && (
            <h3 className="text-xl tracking-tight pt-3">{item.title}</h3>
          )}
          {showDescription && item.richText && (
            <p className="text-muted-foreground text-base py-2">
              {getItemSummary(item)}
            </p>
          )}
        </div>
      </div>
    )

    return (
      <Link
        key={item.id}
        href={`/${urlPrefix ? `${urlPrefix}/` : ''}${item.slug}`}
        className="block hover:opacity-75 transition-opacity"
      >
        {itemContent}
      </Link>
    )
  }

  const renderPagination = () => {
    if (!isPaginated || !data) return null

    return (
      <div className="flex items-center justify-center gap-2 mt-8">
        <Button
          variant="outline"
          size="sm"
          disabled={currentPage === 1}
          asChild
        >
          <Link href={`?page=${currentPage - 1}`}>
            <ChevronLeft className="w-4 h-4 mr-1" />
            Previous
          </Link>
        </Button>
        
        <div className="flex items-center gap-1">
          {Array.from({ length: Math.min(5, data.totalPages) }, (_, i) => {
            let pageNum
            if (data.totalPages <= 5) {
              pageNum = i + 1
            } else if (currentPage <= 3) {
              pageNum = i + 1
            } else if (currentPage >= data.totalPages - 2) {
              pageNum = data.totalPages - 4 + i
            } else {
              pageNum = currentPage - 2 + i
            }
            
            return (
              <Button
                key={pageNum}
                variant={pageNum === currentPage ? "default" : "outline"}
                size="sm"
                asChild
              >
                <Link href={`?page=${pageNum}`}>
                  {pageNum}
                </Link>
              </Button>
            )
          })}
        </div>
        
        <Button
          variant="outline"
          size="sm"
          disabled={currentPage === data.totalPages}
          asChild
        >
          <Link href={`?page=${currentPage + 1}`}>
            Next
            <ChevronRight className="w-4 h-4 ml-1" />
          </Link>
        </Button>
      </div>
    )
  }


  if (loading && !data) {
    return (
      <BlockContainer
        siteWidth={siteWidth}
        customWidth={customWidth}
      >
        <div className="mb-6 md:mb-12">
          <div className={getResponsiveAlignmentClass()}>
            {title && visibility?.title !== false && (
              <h2 className={titleClasses}>
                {title}
              </h2>
            )}
            {subtitle && visibility?.subtitle !== false && (
              <p className={subtitleClasses}>
                {subtitle}
              </p>
            )}
          </div>
        </div>

        <div className={`grid ${gridColumns} gap-4 md:gap-8`}>
          {Array.from({ length: itemsToShow }, (_, i) => (
            <div key={i} className="animate-pulse">
              {showImage && (
                <div className="bg-muted rounded-md aspect-square mb-4"></div>
              )}
              {showTitle && (
                <div className="h-6 bg-muted rounded w-3/4 mb-2"></div>
              )}
              {showDescription && (
                <div className="h-4 bg-muted rounded w-full"></div>
              )}
            </div>
          ))}
        </div>
      </BlockContainer>
    )
  }

  if (!data || listingItems.length === 0) {
    return (
      <BlockContainer
        siteWidth={siteWidth}
        customWidth={customWidth}
      >
        <div className="mb-6 md:mb-12">
          <div className={getResponsiveAlignmentClass()}>
            {title && visibility?.title !== false && (
              <h2 className={titleClasses}>
                {title}
              </h2>
            )}
            {subtitle && visibility?.subtitle !== false && (
              <p className={subtitleClasses}>
                {subtitle}
              </p>
            )}
          </div>
        </div>
        
        <p className="text-muted-foreground text-center py-8">
          {emptyMessage}
        </p>
      </BlockContainer>
    )
  }

  return (
    <BlockContainer
      siteWidth={siteWidth}
      customWidth={customWidth}
    >
      <div className="mb-12">
        <div className={`${getResponsiveAlignmentClass()} ${hasViewAll ? 'md:flex md:justify-between md:items-start' : ''}`}>
          <div className={hasViewAll ? 'md:flex-1' : ''}>
            {title && visibility?.title !== false && (
              <h2 className={titleClasses}>
                {title}
              </h2>
            )}
            {subtitle && visibility?.subtitle !== false && (
              <p className={subtitleClasses}>
                {subtitle}
              </p>
            )}
          </div>
          {hasViewAll && (
            <div className="mt-6 hidden shrink-0 md:mt-0 md:ml-8 md:block">
              <ViewAllButton
                text={viewAllText}
                href={viewAllLink}
              />
            </div>
          )}
        </div>
      </div>

      <div className={`grid ${listingStyle === 'blog' ? 'gap-6 md:grid-cols-2 lg:grid-cols-3 lg:gap-8' : `${gridColumns} gap-8`}`}>
        {listingItems.map((item, index) => renderItem(item, index))}
      </div>

      {hasViewAll && (
        <div className="flex justify-center mt-6 md:mt-8 md:hidden">
          <ViewAllButton
            text={viewAllText}
            href={viewAllLink}
          />
        </div>
      )}

      {renderPagination()}
    </BlockContainer>
  )
}
