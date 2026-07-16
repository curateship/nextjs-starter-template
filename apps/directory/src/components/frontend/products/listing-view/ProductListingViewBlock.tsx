"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "@/lib/navigation-client"
import Link from "@/components/app-link"
import Image from "@/components/app-image"
import { BlockContainer } from "@/components/frontend/layout/block-container"
import { ViewAllButton } from "@/components/ui/view-all-button"
import { getListingViewsData, type ListingViewsData } from "@/lib/actions/pages/page-listing-views-actions"
import { Button } from "@/components/ui/button"
import ChevronLeft from "lucide-react/dist/esm/icons/chevron-left.js"
import ChevronRight from "lucide-react/dist/esm/icons/chevron-right.js"

type ImageFit = 'crop' | 'fit'

interface ProductListingViewBlockProps {
  content: {
    title?: string
    subtitle?: string
    headerAlign?: 'left' | 'center'
    contentType?: 'products'
    imageFit?: ImageFit
    displayMode?: 'grid' | 'list'
    itemsToShow?: number
    columns?: number
    sortBy?: 'date' | 'title' | 'display_order'
    sortOrder?: 'asc' | 'desc'
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

export function ProductListingViewBlock({ content, siteId, siteSubdomain, urlPrefixes, preloadedData, siteWidth = 'custom', customWidth }: ProductListingViewBlockProps) {
  const searchParams = useSearchParams()
  const parsedPage = parseInt(searchParams.get('page') || '1', 10)
  const currentPage = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1

  const {
    title = '',
    subtitle = '',
    headerAlign = 'left',
    contentType = 'products',
    imageFit = 'crop',
    displayMode = 'grid',
    itemsToShow = 6,
    columns = 3,
    sortBy = 'date',
    sortOrder = 'desc',
    isPaginated = false,
    itemsPerPage = 12,
    viewAllText = '',
    viewAllLink = '',
    visibility,
  } = content

  const preloadedListingData = preloadedData as ListingViewsData | null | undefined
  const preloadedMatchesPage = Boolean(
    preloadedListingData && (!isPaginated || preloadedListingData.currentPage === currentPage)
  )
  const [data, setData] = useState<ListingViewsData | null>(() => preloadedMatchesPage ? preloadedListingData! : null)
  const [loading, setLoading] = useState(!preloadedMatchesPage)
  const urlPrefix = urlPrefixes?.products || ""
  const hasViewAll = Boolean(viewAllText && viewAllLink && visibility?.viewAllButton !== false)
  const showImageElement = visibility?.showImage !== false
  const showTitleElement = visibility?.showTitle !== false
  const showDescriptionElement = visibility?.showDescription !== false
  const dataMatchesPage = Boolean(data && (!isPaginated || data.currentPage === currentPage))
  const products = dataMatchesPage ? data?.products || data?.items || [] : []
  const totalPages = dataMatchesPage ? data?.totalPages || 0 : 0
  const headerClassName = `${headerAlign === 'left' ? 'text-left' : 'text-center'} ${hasViewAll ? 'flex justify-between items-start' : ''}`
  const headerMarginClassName = headerAlign === 'center' || !headerAlign ? 'mx-auto' : ''
  const viewAllHref = siteSubdomain ? `/${siteSubdomain}${viewAllLink}` : viewAllLink

  useEffect(() => {
    async function loadData() {
      if (preloadedMatchesPage && preloadedListingData) {
        setData(preloadedListingData)
        setLoading(false)
        return
      }

      setData(null)
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
  }, [siteId, contentType, sortBy, sortOrder, itemsToShow, itemsPerPage, isPaginated, currentPage, preloadedListingData, preloadedMatchesPage])

  const gridColumns = displayMode === 'grid'
    ? `grid-cols-1 sm:grid-cols-2 lg:grid-cols-${columns}`
    : 'grid-cols-1'
  const imageFitClassName = imageFit === 'fit' ? 'object-contain' : 'object-cover'
  const imageFrameClassName = imageFit === 'fit' ? 'bg-muted' : ''

  const renderProduct = (product: any) => {
    const productContent = (
      <div className={displayMode === 'list' ? 'flex gap-6' : 'flex flex-col gap-2'}>
        {showImageElement && (
          <div className={displayMode === 'list' ? 'w-48 shrink-0' : ''}>
            {product.featured_image ? (
              <div className={`relative rounded-md aspect-square overflow-hidden ${imageFrameClassName}`}>
                <Image
                  src={product.featured_image}
                  alt={product.title || 'Product image'}
                  fill
                  className={imageFitClassName}
                  sizes="(max-width: 640px) 384px, (max-width: 1024px) 50vw, 384px"
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
          {showTitleElement && (
            <h3 className="text-xl tracking-tight">{product.title}</h3>
          )}
          {showDescriptionElement && product.richText && (
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
    if (!isPaginated || totalPages === 0) return null

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
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            let pageNum
            if (totalPages <= 5) {
              pageNum = i + 1
            } else if (currentPage <= 3) {
              pageNum = i + 1
            } else if (currentPage >= totalPages - 2) {
              pageNum = totalPages - 4 + i
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
          disabled={currentPage === totalPages}
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

  return (
    <div >
      <BlockContainer
        siteWidth={siteWidth}
        customWidth={customWidth}
      >
        <div className="mb-12">
          <div className={headerClassName}>
            <div className={hasViewAll ? 'flex-1' : ''}>
              {title && visibility?.header !== false && (
                <h2 className={`text-3xl font-bold md:text-5xl max-w-3xl ${headerMarginClassName}`}>
                  {title}
                </h2>
              )}
              {subtitle && visibility?.subheader !== false && (
                <p className={`mt-4 text-lg text-muted-foreground max-w-3xl ${headerMarginClassName}`}>
                  {subtitle}
                </p>
              )}
            </div>
            {hasViewAll && (
              <div className="shrink-0 ml-8">
                <ViewAllButton text={viewAllText} href={viewAllHref} className="mt-0" />
              </div>
            )}
          </div>
        </div>

        {loading || (data && !dataMatchesPage) ? (
          null
        ) : products.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">
            No products available at the moment.
          </p>
        ) : (
          <>
            <div className={`grid ${gridColumns} gap-8`}>
              {products.map(renderProduct)}
            </div>
            {renderPagination()}
          </>
        )}
      </BlockContainer>
    </div>
  )
}
