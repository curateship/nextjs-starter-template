"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { FrontendBlockContainer } from "@/components/ui/frontend-block-container"
import { getListingViewsData, type ListingViewsData } from "@/lib/actions/pages/page-listing-views-actions"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight } from "lucide-react"

interface ListingViewsBlockProps {
  content: {
    title?: string
    subtitle?: string
    headerAlign?: 'left' | 'center'
    contentType?: 'products'
    displayMode?: 'grid' | 'list'
    itemsToShow?: number
    columns?: number
    sortBy?: 'date' | 'title' | 'display_order'
    sortOrder?: 'asc' | 'desc'
    showImage?: boolean
    showTitle?: boolean
    showDescription?: boolean
    isPaginated?: boolean
    itemsPerPage?: number
    viewAllText?: string
    viewAllLink?: string
    backgroundColor?: string
  }
  siteId: string
  siteSubdomain?: string
  urlPrefixes?: {
    products?: string
    posts?: string
  }
}

export function ListingViewsBlock({ content, siteId, siteSubdomain, urlPrefixes }: ListingViewsBlockProps) {
  const [data, setData] = useState<ListingViewsData | null>(null)
  const [loading, setLoading] = useState(true)
  const searchParams = useSearchParams()
  
  // Get current page from URL params
  const currentPage = parseInt(searchParams.get('page') || '1', 10)
  
  // Destructure with defaults
  const {
    title = '',
    subtitle = '',
    headerAlign = 'left',
    contentType = 'products',
    displayMode = 'grid',
    itemsToShow = 6,
    columns = 3,
    sortBy = 'date',
    sortOrder = 'desc',
    showImage = true,
    showTitle = true,
    showDescription = true,
    isPaginated = false,
    itemsPerPage = 12,
    viewAllText = '',
    viewAllLink = '',
    backgroundColor = '#ffffff'
  } = content

  // Get URL prefix from props (passed from parent, no API call needed)
  const urlPrefix = urlPrefixes?.products || ""

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      
      const limit = isPaginated ? itemsPerPage : itemsToShow
      const offset = isPaginated ? (currentPage - 1) * itemsPerPage : 0
      
      const result = await getListingViewsData({
        site_id: siteId,
        contentType,
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
  }, [siteId, contentType, sortBy, sortOrder, itemsToShow, itemsPerPage, isPaginated, currentPage])

  const gridColumns = displayMode === 'grid' 
    ? `grid-cols-1 sm:grid-cols-2 lg:grid-cols-${columns}` 
    : 'grid-cols-1'

  const renderProduct = (product: any) => {
    const productContent = (
      <div className={displayMode === 'list' ? 'flex gap-6' : 'flex flex-col gap-2'}>
        {showImage && (
          <div className={displayMode === 'list' ? 'w-48 flex-shrink-0' : ''}>
            {product.featured_image ? (
              <div className="relative rounded-md aspect-square overflow-hidden">
                <Image
                  src={product.featured_image}
                  alt={product.title || 'Product image'}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                  onError={(e) => {
                    // Fallback to placeholder on error
                    const target = e.target as HTMLElement;
                    target.style.display = 'none';
                    const parent = target.parentElement;
                    if (parent) {
                      parent.innerHTML = '<div class="bg-muted rounded-md aspect-square flex items-center justify-center text-muted-foreground w-full h-full">Image Error</div>';
                    }
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
            <h3 className="text-xl tracking-tight">{product.title}</h3>
          )}
          {showDescription && product.richText && (
            <p className="text-muted-foreground text-base">
              {(() => {
                // Strip HTML tags from rich text for preview
                const plainText = product.richText.replace(/<[^>]*>/g, '').trim()
                return plainText.length > 150 
                  ? plainText.substring(0, 150) + '...'
                  : plainText
              })()}
            </p>
          )}
        </div>
      </div>
    )

    return (
      <Link 
        key={product.id}
        href={`/${urlPrefix ? `${urlPrefix}/` : ''}${product.slug}`}
        className="block hover:opacity-75 transition-opacity"
      >
        {productContent}
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

  // Create inline style for background color
  const backgroundStyle = backgroundColor && backgroundColor !== '#ffffff' 
    ? { backgroundColor } 
    : undefined

  if (loading) {
    return (
      <FrontendBlockContainer
        className=""
        style={backgroundStyle}
        header={{
          title,
          subtitle,
          align: headerAlign
        }}
        viewAllButton={viewAllText && viewAllLink && !isPaginated ? {
          text: viewAllText,
          href: siteSubdomain ? `/${siteSubdomain}${viewAllLink}` : viewAllLink
        } : undefined}
      >
        <div className={`grid ${gridColumns} gap-8`}>
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
      </FrontendBlockContainer>
    )
  }

  if (!data || !data.products || data.products.length === 0) {
    return (
      <FrontendBlockContainer
        className=""
        style={backgroundStyle}
        header={{
          title,
          subtitle,
          align: headerAlign
        }}
        viewAllButton={viewAllText && viewAllLink && !isPaginated ? {
          text: viewAllText,
          href: siteSubdomain ? `/${siteSubdomain}${viewAllLink}` : viewAllLink
        } : undefined}
      >
        <p className="text-muted-foreground text-center py-8">
          No products available at the moment.
        </p>
      </FrontendBlockContainer>
    )
  }

  return (
    <FrontendBlockContainer
      className=""
      style={backgroundStyle}
      header={{
        title,
        subtitle,
        align: headerAlign
      }}
      viewAllButton={viewAllText && viewAllLink && !isPaginated ? {
        text: viewAllText,
        href: siteSubdomain ? `/${siteSubdomain}${viewAllLink}` : viewAllLink
      } : undefined}
    >
      <div className={`grid ${gridColumns} gap-8`}>
        {data.products.map(renderProduct)}
      </div>
      {renderPagination()}
    </FrontendBlockContainer>
  )
}