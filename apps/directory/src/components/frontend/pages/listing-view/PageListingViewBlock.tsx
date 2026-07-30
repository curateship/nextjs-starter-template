"use client"

import { useEffect, useMemo, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "@/lib/navigation-client"
import Link from "@/components/app-link"
import Image from "@/components/app-image"
import { BlockContainer } from "@/components/frontend/layout/block-container"
import { ViewAllButton } from "@/components/frontend/blocks/view-all-button"
import {
  getListingViewsData,
  type ListingViewsData,
  type ListingViewsItem
} from "@/lib/actions/pages/page-listing-views-actions"
import {
  DIRECTORY_MAP_LISTING_LIMIT,
  isDirectoryMapBlock
} from "@/lib/actions/directories/directory-map-core"
import {
  formatDistanceKm,
  formatNearParam,
  normalizeRadiusKm,
  parseNearParam
} from "@/lib/actions/directories/directory-near-me-core"
import { getDirectoryMapConfigAction } from "@/lib/actions/directories/directory-map-actions"
import { NearMeControls, type NearMeSelection } from "./NearMeControls"
import { ListingMapView, getMappableListings } from "./ListingMapView"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Card, CardFooter, CardHeader } from "@/components/ui/card"
import { FeaturedBadge } from "@/components/frontend/directories/FeaturedBadge"
import ArrowRight from "lucide-react/dist/esm/icons/arrow-right.js"
import ChevronLeft from "lucide-react/dist/esm/icons/chevron-left.js"
import ChevronRight from "lucide-react/dist/esm/icons/chevron-right.js"
import MapPin from "lucide-react/dist/esm/icons/map-pin.js"
import Navigation from "lucide-react/dist/esm/icons/navigation.js"
import { DirectorySaveDropdown } from "@/components/frontend/directories/DirectorySaveDropdown"
import { Rating } from "@/components/shadcnblocks/rating"

type ListingContentType = "products" | "posts" | "directory"
type ListingStyle = "default" | "blog" | "directory"
type ImageFit = "crop" | "fit"

function getInitials(name?: string | null) {
  if (!name) return "?"
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

interface ListingViewsBlockProps {
  content: {
    title?: string
    subtitle?: string
    headerAlign?: "left" | "center"
    mobileHeaderAlign?: "left" | "center"
    contentType?: ListingContentType
    categoryIds?: string[]
    listingStyle?: ListingStyle
    imageFit?: ImageFit
    imageHeight?: number
    saveIconOpacity?: number
    categoryChipParentIds?: string[]
    enableNearMe?: boolean
    nearMeRadiusKm?: number
    displayMode?: "grid" | "list" | "map"
    itemsToShow?: number
    mobileColumns?: number
    columns?: number
    sortBy?: "date" | "title" | "display_order"
    sortOrder?: "asc" | "desc"
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
    directory?: string
  }
  preloadedData?: any
  /**
   * Map key resolved on the server. `undefined` means "not preloaded" and falls
   * back to a client fetch; `null` means "resolved, this site has no key".
   */
  preloadedMapApiKey?: string | null
  siteWidth?: "full" | "custom"
  customWidth?: number
}

export function ListingViewsBlock({
  content,
  siteId,
  urlPrefixes,
  preloadedData,
  preloadedMapApiKey,
  siteWidth = "custom",
  customWidth
}: ListingViewsBlockProps) {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()

  // Get current page from URL params
  const parsedPage = parseInt(searchParams.get("page") || "1", 10)
  const currentPage = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1

  // Destructure with defaults
  const {
    title = "",
    subtitle = "",
    headerAlign = "left",
    mobileHeaderAlign = "left",
    contentType = "products",
    categoryIds: rawCategoryIds = [],
    listingStyle = "default",
    imageFit = "crop",
    imageHeight,
    saveIconOpacity = 70,
    categoryChipParentIds: rawCategoryChipParentIds = [],
    enableNearMe = false,
    nearMeRadiusKm,
    displayMode = "grid",
    itemsToShow = 6,
    mobileColumns = 1,
    columns = 3,
    sortBy = "date",
    sortOrder = "desc",
    isPaginated = false,
    itemsPerPage = 12,
    viewAllText = "",
    viewAllLink = "",
    visibility
  } = content
  // Map mode plots the whole (capped) filtered result set; pagination is ignored.
  const isMapMode = isDirectoryMapBlock({ displayMode, contentType })
  // "Near me" lives in the URL so a filtered view can be shared and survives paging.
  const nearMeEnabled = contentType === "directory" && enableNearMe === true
  const nearParam = nearMeEnabled ? searchParams.get("near") : null
  const nearPoint = useMemo(() => parseNearParam(nearParam), [nearParam])
  const nearRadiusKm = normalizeRadiusKm(searchParams.get("radius"), nearMeRadiusKm)
  const nearPlaceLabel = (searchParams.get("place") || "").trim().slice(0, 120) || "your location"
  const nearSelection: NearMeSelection | null = nearPoint ? { ...nearPoint, label: nearPlaceLabel } : null
  // One stable value for the effect below: changing the radius before picking a
  // location leaves this null, so it doesn't trigger a pointless refetch.
  const nearFilter = useMemo(
    () => (nearPoint ? { ...nearPoint, radiusKm: nearRadiusKm } : null),
    [nearPoint, nearRadiusKm]
  )
  const preloadedListingData = preloadedData as ListingViewsData | null | undefined
  // The server preload never carries a visitor's distance filter, so an active
  // one always goes back to the server.
  const preloadedMatchesPage = Boolean(
    preloadedListingData
      && !nearPoint
      && (isMapMode || !isPaginated || preloadedListingData.currentPage === currentPage)
  )
  const [data, setData] = useState<ListingViewsData | null>(() => preloadedMatchesPage ? preloadedListingData! : null)
  const [loading, setLoading] = useState(!preloadedMatchesPage)
  // Seeded from the server so a map block renders its final shape in the initial
  // HTML. Left null only when the key was not preloaded, which is the one case
  // that still needs the client fetch below.
  const [mapConfig, setMapConfig] = useState<{ apiKey: string | null } | null>(
    preloadedMapApiKey === undefined ? null : { apiKey: preloadedMapApiKey }
  )
  const categoryIds = Array.isArray(rawCategoryIds) ? rawCategoryIds : []
  const categoryIdsKey = categoryIds.join("|")
  const categoryChipParentIds = Array.isArray(rawCategoryChipParentIds) ? rawCategoryChipParentIds : []
  const categoryChipParentIdsKey = categoryChipParentIds.join("|")
  const categoryChipParentIdSet = new Set(categoryChipParentIds)

  // Extract repeated conditions
  const hasViewAll = Boolean(viewAllText && viewAllLink && visibility?.viewAllButton !== false)
  const showImageElement = visibility?.showImage !== false
  const showTitleElement = visibility?.showTitle !== false
  const showDescriptionElement = visibility?.showDescription !== false
  const showMetaDescriptionElement = visibility?.showMetaDescription !== false
  const showAuthorElement = visibility?.showAuthor !== false
  const showDateElement = visibility?.showDate !== false
  const showReadMoreElement = visibility?.showReadMore !== false
  const showRatingElement = visibility?.showRating !== false
  const showAddressElement = visibility?.showAddress !== false
  const showSaveButton = contentType === "directory" && showImageElement && visibility?.showSaveButton !== false

  // Create responsive alignment classes
  const getResponsiveAlignmentClass = () => {
    const mobileClass = mobileHeaderAlign === "center" ? "text-center" : "text-left"
    const desktopClass = headerAlign === "center" ? "md:text-center" : "md:text-left"
    return `${mobileClass} ${desktopClass}`
  }

  const getResponsiveMarginClass = () => {
    const mobileClass = mobileHeaderAlign === "center" ? "mx-auto" : ""
    const desktopClass = headerAlign === "center" ? "md:mx-auto" : mobileHeaderAlign === "center" ? "md:mx-0" : ""
    return `${mobileClass} ${desktopClass}`.trim()
  }

  const titleClasses = `text-3xl font-bold md:text-5xl max-w-3xl ${getResponsiveMarginClass()}`
  const subtitleClasses = `mt-2 md:mt-4 text-lg text-muted-foreground max-w-3xl ${getResponsiveMarginClass()}`

  const renderHeader = (className = "mb-6 md:mb-12") => (
    <div className={className}>
      <div
        className={`${getResponsiveAlignmentClass()} ${hasViewAll ? "md:flex md:justify-between md:items-start" : ""}`}
      >
        <div className={hasViewAll ? "md:flex-1" : ""}>
          {title && visibility?.title !== false && <h2 className={titleClasses}>{title}</h2>}
          {subtitle && visibility?.subtitle !== false && <p className={subtitleClasses}>{subtitle}</p>}
        </div>
        {hasViewAll && (
          <div className="mt-6 hidden shrink-0 md:mt-0 md:ml-8 md:block">
            <ViewAllButton text={viewAllText} href={viewAllLink} />
          </div>
        )}
      </div>
    </div>
  )

  const dataMatchesPage = Boolean(data && (!isPaginated || data.currentPage === currentPage))
  const displayedData = dataMatchesPage ? data : null
  const listingItems = displayedData?.items || displayedData?.products || displayedData?.posts || displayedData?.directories || []
  // Stable reference so the map only rebuilds markers when the data actually changes.
  const mappableListings = useMemo(() => {
    if (!isMapMode) return []
    return getMappableListings(displayedData?.items || displayedData?.directories || [])
  }, [isMapMode, displayedData])
  const emptyMessage = nearPoint
    ? `No listings within ${nearRadiusKm} km of ${nearPlaceLabel}. Try a wider distance or a different location.`
    : contentType === "posts"
      ? "No posts available at the moment."
      : contentType === "directory"
        ? "No directory listings available at the moment."
        : "No products available at the moment."

  /** Rebuild the current URL, always dropping the page so a new filter starts at page 1. */
  const replaceParams = (mutate: (params: URLSearchParams) => void) => {
    const params = new URLSearchParams(searchParams.toString())
    mutate(params)
    params.delete("page")
    const queryString = params.toString()
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false })
  }

  const applyNearSelection = (selection: NearMeSelection) => {
    replaceParams((params) => {
      params.set("near", formatNearParam(selection))
      params.set("place", selection.label)
      params.set("radius", String(nearRadiusKm))
    })
  }

  const changeNearRadius = (radiusKm: number) => {
    replaceParams((params) => params.set("radius", String(normalizeRadiusKm(radiusKm, nearMeRadiusKm))))
  }

  const clearNearSelection = () => {
    replaceParams((params) => {
      params.delete("near")
      params.delete("place")
      params.delete("radius")
    })
  }

  const nearMeControls = nearMeEnabled ? (
    <div className="mb-6 md:mb-8">
      <NearMeControls
        siteId={siteId}
        selection={nearSelection}
        radiusKm={nearRadiusKm}
        onApply={applyNearSelection}
        onRadiusChange={changeNearRadius}
        onClear={clearNearSelection}
      />
    </div>
  ) : null

  // Get URL prefix from props (passed from parent, no API call needed)
  const urlPrefix = urlPrefixes?.[contentType] || contentType

  useEffect(() => {
    async function loadData() {
      // Use preloaded data for initial load if available
      if (preloadedMatchesPage && preloadedListingData) {
        setData(preloadedListingData)
        setLoading(false)
        return
      }

      setData(null)
      setLoading(true)

      const limit = isMapMode ? DIRECTORY_MAP_LISTING_LIMIT : isPaginated ? itemsPerPage : itemsToShow
      const offset = isMapMode || !isPaginated ? 0 : (currentPage - 1) * itemsPerPage

      const result = await getListingViewsData({
        site_id: siteId,
        contentType,
        categoryIds: categoryIdsKey ? categoryIdsKey.split("|") : [],
        // A chosen location means "show me the closest", so it overrides the
        // block's configured sort for as long as the filter is on.
        sortBy: nearFilter ? "distance" : sortBy,
        sortOrder,
        limit,
        offset,
        includeCategories: contentType === "directory" && categoryChipParentIdsKey.length > 0,
        near: nearFilter ?? undefined
      })

      if (result.success && result.data) {
        setData(result.data)
      }

      setLoading(false)
    }

    loadData()
  }, [
    siteId,
    contentType,
    categoryIdsKey,
    categoryChipParentIdsKey,
    sortBy,
    sortOrder,
    itemsToShow,
    itemsPerPage,
    isPaginated,
    isMapMode,
    currentPage,
    nearFilter,
    preloadedListingData,
    preloadedMatchesPage
  ])

  useEffect(() => {
    if (!isMapMode || preloadedMapApiKey !== undefined) return
    let active = true
    getDirectoryMapConfigAction(siteId)
      .then((config) => {
        if (active) setMapConfig(config)
      })
      .catch(() => {
        if (active) setMapConfig({ apiKey: null })
      })
    return () => {
      active = false
    }
  }, [isMapMode, preloadedMapApiKey, siteId])

  const mobileGridColumns = Number(mobileColumns) === 2 ? "grid-cols-2" : "grid-cols-1"
  const desktopGridColumns = Number(columns) === 2 ? "lg:grid-cols-2" : Number(columns) === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"
  // Map mode falls back to the grid layout when the map itself can't render.
  const gridColumns = displayMode !== "list" ? `${mobileGridColumns} sm:grid-cols-2 ${desktopGridColumns}` : "grid-cols-1"
  const mobileImageSize = Number(mobileColumns) === 2 ? "50vw" : "100vw"
  const desktopImageSize = Number(columns) === 2 ? "50vw" : Number(columns) === 4 ? "25vw" : "33vw"
  const gridImageSizes = `(max-width: 639px) ${mobileImageSize}, (max-width: 1023px) 50vw, ${desktopImageSize}`
  const blogImageSizes = `(max-width: 767px) ${mobileImageSize}, (max-width: 1023px) 50vw, ${desktopImageSize}`
  const saveIconOpacityNumber = Number(saveIconOpacity)
  const resolvedSaveIconOpacity = Math.min(100, Math.max(0, Number.isFinite(saveIconOpacityNumber) ? saveIconOpacityNumber : 70))
  const imageFitClassName = imageFit === "fit" ? "object-contain" : "object-cover"
  const imageFrameClassName = imageFit === "fit" ? "bg-muted" : ""
  const customImageHeight = Number(imageHeight) > 0 ? Number(imageHeight) : undefined
  const imageFrameStyle = customImageHeight ? { aspectRatio: `100 / ${customImageHeight}` } : undefined
  const defaultImageAspectClassName = customImageHeight ? "" : "aspect-square"
  const blogImageAspectClassName = customImageHeight ? "" : "aspect-video"
  const isCardListingStyle = listingStyle === "blog" || listingStyle === "directory"
  const isCompactMobileCard = listingStyle === "directory" && Number(mobileColumns) === 2

  const formatDate = (value?: string | null) => {
    if (!value) return ""

    return new Intl.DateTimeFormat("en-US", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
      year: "numeric"
    }).format(new Date(value))
  }

  const getItemSummary = (item: ListingViewsItem) => {
    const plainText = (item.richText || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
    return plainText.length > 150 ? plainText.substring(0, 150) + "..." : plainText
  }

  const getMetaDescription = (item: ListingViewsItem) => {
    const plainText = item.metaDescription || ""
    const words = plainText.split(/\s+/).filter(Boolean)
    return words.length > 15 ? `${words.slice(0, 15).join(" ")}...` : plainText
  }

  const getRatingValue = (rating?: number | null) => {
    const value = Number(rating)
    if (!Number.isFinite(value) || value <= 0) return null
    return Math.min(5, value)
  }

  const getCategoryChips = (item: ListingViewsItem) => {
    if (contentType !== "directory" || categoryChipParentIdSet.size === 0) return []
    return (item.categories || []).filter((category) => category.parent_id && categoryChipParentIdSet.has(category.parent_id))
  }

  const renderItem = (item: ListingViewsItem, index: number) => {
    // First image in grid is likely LCP element - prioritize it aggressively
    const isLCP = index === 0
    const href = `/${urlPrefix ? `${urlPrefix}/` : ""}${item.slug}`
    const distanceLabel = nearPoint ? formatDistanceKm(item.distanceKm) : ""
    const itemLabel = item.title || (contentType === "posts" ? "post" : contentType === "directory" ? "directory listing" : "product")
    const imageAlt = item.title || `${contentType === "posts" ? "Post" : contentType === "directory" ? "Directory listing" : "Product"} image`
    const saveButton = showSaveButton ? (
      <DirectorySaveDropdown
        siteId={siteId}
        directoryId={item.id}
        opacity={resolvedSaveIconOpacity}
        className="absolute right-2 top-2 z-10 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
      />
    ) : null

    if (isCardListingStyle) {
      const summary = getItemSummary(item)
      const published = showDateElement ? formatDate(item.created_at) : ""
      const authorName = item.author?.trim() || ""
      const showAuthorMeta = showAuthorElement && Boolean(authorName)
      const rating = listingStyle === "directory" && showRatingElement ? getRatingValue(item.rating) : null
      const address = listingStyle === "directory" && showAddressElement ? item.address?.trim() : ""
      const categoryChips = listingStyle === "directory" ? getCategoryChips(item) : []
      const metaDescription = listingStyle === "directory" && showMetaDescriptionElement ? getMetaDescription(item) : ""
      const featuredBadge = contentType === "directory" && item.featured ? <FeaturedBadge /> : null

      return (
        <Card
          key={item.id}
          className="group/card grid h-full grid-rows-[auto_auto_1fr_auto] overflow-hidden"
        >
          {showImageElement && (
            <div className={`group relative ${blogImageAspectClassName} w-full overflow-hidden ${imageFrameClassName}`} style={imageFrameStyle}>
              <Link
                href={href}
                tabIndex={-1}
                className="absolute inset-0 outline-none"
                aria-label={`Read ${itemLabel}`}
              >
                {item.featured_image ? (
                  <Image
                    src={item.featured_image}
                    alt={imageAlt}
                    fill
                    className={`${imageFitClassName} object-center transition-opacity duration-200 group-hover/card:opacity-75`}
                    sizes={blogImageSizes}
                    priority={isLCP}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-muted text-foreground">
                    No Image
                  </div>
                )}
              </Link>
              {saveButton}
            </div>
          )}
          <Link
            href={href}
            className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label={`Read ${itemLabel}`}
          >
            <CardHeader className={isCompactMobileCard ? "p-3 pb-3 md:p-4 md:pb-3" : undefined}>
              {featuredBadge}
              {showTitleElement && <h3 className={isCompactMobileCard ? "text-sm font-semibold leading-snug md:text-xl" : "text-base md:text-xl"}>{item.title}</h3>}
              {rating && (
                <div className={isCompactMobileCard ? "flex flex-col gap-1.5 text-xs text-muted-foreground md:gap-2 md:text-sm" : "flex flex-col gap-2 text-sm text-muted-foreground"}>
                  <Rating
                    rate={rating}
                    showScore
                    className={isCompactMobileCard ? "gap-1 [&_span]:text-xs [&_svg]:size-3 [&>div]:size-3 md:gap-2 md:[&_span]:text-sm md:[&_svg]:size-4 md:[&>div]:size-4" : "[&_svg]:size-4 [&>div]:size-4"}
                  />
                </div>
              )}
              {metaDescription && (
                <p className={isCompactMobileCard ? "py-2 text-xs leading-snug text-muted-foreground md:text-sm" : "py-2 text-sm leading-relaxed text-muted-foreground"}>
                  {metaDescription}
                </p>
              )}
              {address && (
                <div className={isCompactMobileCard ? "flex items-start gap-1 text-xs text-muted-foreground md:gap-1.5 md:text-sm" : "flex items-start gap-1.5 text-sm text-muted-foreground"}>
                  <MapPin className={isCompactMobileCard ? "mt-0.5 size-3.5 shrink-0 text-foreground md:size-4" : "mt-0.5 size-4 shrink-0 text-foreground"} />
                  <span className="min-w-0">{address}</span>
                </div>
              )}
              {distanceLabel && (
                <div className={isCompactMobileCard ? "flex items-start gap-1 text-xs text-muted-foreground md:gap-1.5 md:text-sm" : "flex items-start gap-1.5 text-sm text-muted-foreground"}>
                  <Navigation className={isCompactMobileCard ? "mt-0.5 size-3.5 shrink-0 text-foreground md:size-4" : "mt-0.5 size-4 shrink-0 text-foreground"} />
                  <span className="min-w-0">{distanceLabel}</span>
                </div>
              )}
              {categoryChips.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {categoryChips.map((category) => (
                    <span
                      key={category.id}
                      className={isCompactMobileCard ? "rounded-full bg-foreground/5 px-2 py-0.5 text-[11px] text-muted-foreground" : "rounded-full bg-foreground/5 px-2.5 py-1 text-xs text-muted-foreground"}
                    >
                      {category.title}
                    </span>
                  ))}
                </div>
              )}
              {listingStyle !== "directory" && showDescriptionElement && summary && <p className="my-4 leading-relaxed text-muted-foreground">{summary}</p>}
              {listingStyle === "blog" && (showAuthorMeta || published) && (
                <div className="mt-3 flex items-center gap-2">
                  {showAuthorMeta && (
                    <Avatar className="size-9 border">
                      {item.author_image && <AvatarImage src={item.author_image} alt={authorName} />}
                      <AvatarFallback className="text-xs">{getInitials(authorName)}</AvatarFallback>
                    </Avatar>
                  )}
                  <div className="flex min-w-0 flex-col">
                    {showAuthorMeta && <span className="text-sm font-semibold text-foreground/80">{authorName}</span>}
                    {published && <span className="text-xs text-muted-foreground">{published}</span>}
                  </div>
                </div>
              )}
            </CardHeader>
          </Link>
          {listingStyle === "blog" && showReadMoreElement && (
            <CardFooter>
              <Link href={href} className="flex items-center text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                Read more
                <ArrowRight className="ml-1 size-4" />
              </Link>
            </CardFooter>
          )}
        </Card>
      )
    }

    const itemContent = (
      <div className={displayMode === "list" ? "flex gap-6" : "flex flex-col gap-2"}>
        {showImageElement && (
          <div className={displayMode === "list" ? "w-48 shrink-0" : ""}>
            {item.featured_image ? (
              <div className={`group relative rounded-md ${defaultImageAspectClassName} overflow-hidden ${imageFrameClassName}`} style={imageFrameStyle}>
                <Link href={href} tabIndex={-1} className="absolute inset-0 outline-none">
                  <Image
                    src={item.featured_image}
                    alt={imageAlt}
                    fill
                    className={imageFitClassName}
                    sizes={displayMode === "list" ? "192px" : gridImageSizes}
                    priority={isLCP}
                    loading={isLCP ? "eager" : index < columns ? "eager" : "lazy"}
                    // Only the LCP image is high priority. Marking the whole
                    // first row "high" makes them compete with each other and
                    // with CSS/JS, which is the opposite of prioritising.
                    fetchPriority={isLCP ? "high" : "auto"}
                    onError={(e) => {
                      // Hide broken image via opacity (avoids forced reflow from style.display)
                      ;(e.target as HTMLElement).style.opacity = "0"
                    }}
                  />
                </Link>
                {saveButton}
              </div>
            ) : (
              <div className={`group relative bg-muted rounded-md ${defaultImageAspectClassName} flex items-center justify-center overflow-hidden text-foreground`} style={imageFrameStyle}>
                <Link href={href} tabIndex={-1} className="absolute inset-0 flex items-center justify-center outline-none">
                  No Image
                </Link>
                {saveButton}
              </div>
            )}
          </div>
        )}
        <Link href={href} className="flex flex-col gap-2 hover:opacity-75 transition-opacity">
          {contentType === "directory" && item.featured && <FeaturedBadge className="mt-3" />}
          {showTitleElement && <h3 className="pt-3 text-base tracking-tight md:text-xl">{item.title}</h3>}
          {distanceLabel && (
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Navigation className="size-4 shrink-0 text-foreground" />
              {distanceLabel}
            </span>
          )}
          {showDescriptionElement && item.richText && (
            <p className="text-muted-foreground text-base py-2">{getItemSummary(item)}</p>
          )}
        </Link>
      </div>
    )

    return (
      <div
        key={item.id}
        className="block"
      >
        {itemContent}
      </div>
    )
  }

  // Page links carry the rest of the query string so an active distance filter
  // (or anything else a page puts there) survives paging.
  const getPageHref = (page: number) => {
    const params = new URLSearchParams(searchParams.toString())
    if (page > 1) params.set("page", String(page))
    else params.delete("page")
    const queryString = params.toString()
    return queryString ? `${pathname}?${queryString}` : pathname
  }

  const renderPagination = () => {
    if (isMapMode || !isPaginated || !displayedData) return null

    return (
      <div className="flex items-center justify-center gap-2 mt-8">
        <Button variant="outline" size="sm" disabled={currentPage === 1} asChild>
          <Link href={getPageHref(currentPage - 1)}>
            <ChevronLeft className="w-4 h-4 mr-1" />
            Previous
          </Link>
        </Button>

        <div className="flex items-center gap-1">
          {Array.from({ length: Math.min(5, displayedData.totalPages) }, (_, i) => {
            let pageNum
            if (displayedData.totalPages <= 5) {
              pageNum = i + 1
            } else if (currentPage <= 3) {
              pageNum = i + 1
            } else if (currentPage >= displayedData.totalPages - 2) {
              pageNum = displayedData.totalPages - 4 + i
            } else {
              pageNum = currentPage - 2 + i
            }

            return (
              <Button key={pageNum} variant={pageNum === currentPage ? "default" : "outline"} size="sm" asChild>
                <Link href={getPageHref(pageNum)}>{pageNum}</Link>
              </Button>
            )
          })}
        </div>

        <Button variant="outline" size="sm" disabled={currentPage === displayedData.totalPages} asChild>
          <Link href={getPageHref(currentPage + 1)}>
            Next
            <ChevronRight className="w-4 h-4 ml-1" />
          </Link>
        </Button>
      </div>
    )
  }

  // The controls stay on screen while results load and when the radius matches
  // nothing — otherwise the visitor loses the very control that would widen it.
  if (loading || (isMapMode && mapConfig === null) || (!displayedData && data && !dataMatchesPage)) {
    return (
      <BlockContainer siteWidth={siteWidth} customWidth={customWidth}>
        {renderHeader(nearMeControls ? "mb-6" : "mb-6 md:mb-12")}
        {nearMeControls}
      </BlockContainer>
    )
  }

  if (!displayedData || listingItems.length === 0) {
    return (
      <BlockContainer siteWidth={siteWidth} customWidth={customWidth}>
        {renderHeader(nearMeControls ? "mb-6" : "mb-6 md:mb-12")}
        {nearMeControls}

        <p className="text-muted-foreground text-center py-8">{emptyMessage}</p>
      </BlockContainer>
    )
  }

  const showMap = isMapMode && Boolean(mapConfig?.apiKey) && mappableListings.length > 0
  const hiddenFromMapCount = listingItems.length - mappableListings.length

  return (
    <BlockContainer siteWidth={siteWidth} customWidth={customWidth}>
      {renderHeader(nearMeControls ? "mb-6" : undefined)}
      {nearMeControls}

      {showMap ? (
        <div className="space-y-3">
          <ListingMapView
            apiKey={mapConfig!.apiKey!}
            listings={mappableListings}
            urlPrefix={urlPrefix}
          />
          {(hiddenFromMapCount > 0 || (displayedData?.totalCount ?? 0) > listingItems.length) && (
            <p className="text-sm text-muted-foreground">
              {(displayedData?.totalCount ?? 0) > listingItems.length
                ? `Showing the first ${listingItems.length} of ${displayedData?.totalCount} listings. `
                : ""}
              {hiddenFromMapCount > 0
                ? `${hiddenFromMapCount} listing${hiddenFromMapCount === 1 ? "" : "s"} without a map location ${hiddenFromMapCount === 1 ? "isn't" : "aren't"} shown on the map.`
                : ""}
            </p>
          )}
        </div>
      ) : (
        <div
          className={`grid ${isCardListingStyle ? `gap-6 ${mobileGridColumns} sm:grid-cols-2 ${desktopGridColumns} lg:gap-8` : `${gridColumns} gap-8`}`}
        >
          {listingItems.map((item, index) => renderItem(item, index))}
        </div>
      )}

      {hasViewAll && (
        <div className="flex justify-center mt-6 md:mt-8 md:hidden">
          <ViewAllButton text={viewAllText} href={viewAllLink} />
        </div>
      )}

      {renderPagination()}
    </BlockContainer>
  )
}
