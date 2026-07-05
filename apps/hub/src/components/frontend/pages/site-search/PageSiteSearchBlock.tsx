"use client"

import { FormEvent, useEffect, useMemo, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Search } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { BlockContainer } from "@/components/frontend/layout/block-container"
import {
  searchSiteAction,
  type SiteSearchResult,
} from "@/lib/actions/site-search/site-search-actions"
import {
  SITE_SEARCH_TYPE_LABELS,
  normalizeSiteSearchTypes,
  type SiteSearchFilterType,
} from "@/lib/site-search/types"

interface PageSiteSearchBlockProps {
  content?: {
    title?: string
    subtitle?: string
    placeholder?: string
    emptyText?: string
    noResultsText?: string
    enabledTypes?: string[]
    pageSize?: number
    showTypeChips?: boolean
    showImages?: boolean
    showSummaries?: boolean
    visibility?: Record<string, boolean>
  }
  siteId: string
  siteWidth?: "full" | "custom"
  customWidth?: number
}

function normalizeType(value: string | null, enabledTypes: string[]): SiteSearchFilterType {
  return value && enabledTypes.includes(value) ? value as SiteSearchFilterType : "all"
}

function normalizePage(value: string | null) {
  const page = Number(value)
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1
}

export function PageSiteSearchBlock({
  content,
  siteId,
  siteWidth = "custom",
  customWidth,
}: PageSiteSearchBlockProps) {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()
  const enabledTypes = useMemo(() => normalizeSiteSearchTypes(content?.enabledTypes), [content?.enabledTypes])
  const query = (searchParams.get("q") || "").trim()
  const type = normalizeType(searchParams.get("type"), enabledTypes)
  const page = normalizePage(searchParams.get("searchPage"))
  const [draftQuery, setDraftQuery] = useState(query)
  const [data, setData] = useState<SiteSearchResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const {
    title = "Search",
    subtitle = "Find anything on this site",
    placeholder = "Search this site...",
    emptyText = "Enter a search term to find public content.",
    noResultsText = "No results found.",
    pageSize = 12,
    showTypeChips = true,
    showImages = true,
    showSummaries = true,
    visibility = {},
  } = content || {}

  useEffect(() => {
    setDraftQuery(query)
  }, [query])

  useEffect(() => {
    let cancelled = false
    const trimmedQuery = query.trim()

    if (trimmedQuery.length < 2) {
      setData(null)
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)
    searchSiteAction({
      siteId,
      query: trimmedQuery,
      type,
      page,
      pageSize,
      enabledTypes,
    }).then((result) => {
      if (cancelled) return
      if (result.success && result.data) {
        setData(result.data)
      } else {
        setData(null)
        setError(result.error || "Search failed")
      }
    }).catch(() => {
      if (!cancelled) {
        setData(null)
        setError("Search failed")
      }
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [enabledTypes, page, pageSize, query, siteId, type])

  if (visibility.hideBlock === true) return null

  const updateUrl = (nextQuery: string, nextType: SiteSearchFilterType = type, nextPage = 1) => {
    const params = new URLSearchParams(searchParams.toString())
    const trimmedQuery = nextQuery.trim()

    if (trimmedQuery) params.set("q", trimmedQuery)
    else params.delete("q")

    if (nextType === "all") params.delete("type")
    else params.set("type", nextType)

    if (nextPage > 1) params.set("searchPage", String(nextPage))
    else params.delete("searchPage")

    const queryString = params.toString()
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false })
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    updateUrl(draftQuery, type, 1)
  }

  const showTitle = visibility.title !== false && Boolean(title)
  const showSubtitle = visibility.subtitle !== false && Boolean(subtitle)
  const showForm = visibility.form !== false
  const showChips = showTypeChips && visibility.typeChips !== false && query.length >= 2
  const showResults = visibility.results !== false
  const totalCount = data?.pagination.totalItems || 0

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
      <div className="space-y-6">
        {showForm && (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row">
            <Input
              value={draftQuery}
              onChange={(event) => setDraftQuery(event.target.value)}
              placeholder={placeholder}
              className="min-h-11 flex-1 text-base"
            />
            <Button type="submit" className="min-h-11 gap-2">
              <Search className="h-4 w-4" />
              Search
            </Button>
          </form>
        )}

        {showChips && (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={type === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => updateUrl(query, "all", 1)}
            >
              All {totalCount ? `(${totalCount})` : ""}
            </Button>
            {enabledTypes.map((searchType) => (
              <Button
                key={searchType}
                type="button"
                variant={type === searchType ? "default" : "outline"}
                size="sm"
                onClick={() => updateUrl(query, searchType, 1)}
              >
                {SITE_SEARCH_TYPE_LABELS[searchType]} {data?.facets[searchType] ? `(${data.facets[searchType]})` : ""}
              </Button>
            ))}
          </div>
        )}

        {showResults && (
          <div className="space-y-3">
            {query.length < 2 ? (
              <p className="text-sm text-muted-foreground">{emptyText}</p>
            ) : loading ? (
              <p className="text-sm text-muted-foreground">Searching...</p>
            ) : error ? (
              <p className="text-sm text-muted-foreground">{error}</p>
            ) : data && data.items.length > 0 ? (
              <>
                <div className="space-y-3">
                  {data.items.map((item) => (
                    <Link
                      key={`${item.type}-${item.url}`}
                      href={item.url}
                      className="grid gap-4 rounded-md border p-4 transition-colors hover:bg-muted/40 sm:grid-cols-[96px_minmax(0,1fr)]"
                    >
                      {showImages && item.image ? (
                        <Image
                          src={item.image}
                          alt=""
                          width={96}
                          height={96}
                          unoptimized
                          className="h-24 w-full rounded-md object-cover sm:w-24"
                        />
                      ) : showImages ? (
                        <div className="hidden h-24 w-24 rounded-md bg-muted sm:block" />
                      ) : null}
                      <div className="min-w-0 space-y-2">
                        <Badge variant="outline" className="rounded-full">
                          {SITE_SEARCH_TYPE_LABELS[item.type]}
                        </Badge>
                        <div className="space-y-1">
                          <h3 className="text-base font-semibold leading-snug">{item.title}</h3>
                          {showSummaries && item.summary && (
                            <p className="line-clamp-2 text-sm text-muted-foreground">{item.summary}</p>
                          )}
                          <p className="truncate text-xs text-muted-foreground">{item.url}</p>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>

                {data.pagination.totalPages > 1 && (
                  <div className="flex items-center justify-between gap-3 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => updateUrl(query, type, page - 1)}
                    >
                      Previous
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Page {data.pagination.page} of {data.pagination.totalPages}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={page >= data.pagination.totalPages}
                      onClick={() => updateUrl(query, type, page + 1)}
                    >
                      Next
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{noResultsText}</p>
            )}
          </div>
        )}
      </div>
    </BlockContainer>
  )
}
