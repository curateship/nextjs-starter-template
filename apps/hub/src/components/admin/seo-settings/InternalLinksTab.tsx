"use client"

import { useCallback, useEffect, useState } from "react"
import { AlertCircle, AlertTriangle, CheckCircle2, Link2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardGroup, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { getInternalLinkAnalysis, getSiteForAudit } from "@/lib/actions/seo/site-audit/site-audit-actions"

interface InternalLinksTabProps {
  siteId: string
  searchQuery: string
}

export function InternalLinksTab({ siteId, searchQuery }: InternalLinksTabProps) {
  const [loading, setLoading] = useState(true)
  const [linkAnalysis, setLinkAnalysis] = useState<any>(null)
  const [contentTypeFilter, setContentTypeFilter] = useState("all")

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [siteData, linkData] = await Promise.all([getSiteForAudit(siteId), getInternalLinkAnalysis(siteId)])
      if (siteData) setLinkAnalysis(linkData)
    } catch (err) {
      console.error("Error loading link data:", err)
    }
    setLoading(false)
  }, [siteId])

  useEffect(() => {
    loadData()
  }, [loadData])

  const normalizedSearchQuery = searchQuery.trim().toLowerCase()
  const orphanContent = linkAnalysis?.orphanContent || []
  const brokenLinks = linkAnalysis?.brokenLinks || []
  const filteredOrphanContent = orphanContent.filter((item: any) => {
    if (contentTypeFilter !== "all" && item.type !== contentTypeFilter) return false
    if (!normalizedSearchQuery) return true

    const searchText = [item.type, item.title, item.slug].filter(Boolean).join(" ").toLowerCase()

    return searchText.includes(normalizedSearchQuery)
  })
  const filteredBrokenLinks = brokenLinks.filter((item: any) => {
    if (contentTypeFilter !== "all" && item.sourceType !== contentTypeFilter) return false
    if (!normalizedSearchQuery) return true

    const searchText = [item.sourceType, item.sourceTitle, item.href].filter(Boolean).join(" ").toLowerCase()

    return searchText.includes(normalizedSearchQuery)
  })

  if (loading) {
    return (
      <CardGroup className="grid">
        <CardGroup className="grid md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </CardGroup>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </CardContent>
        </Card>
      </CardGroup>
    )
  }

  return (
    <CardGroup className="grid">
      <CardGroup className="grid md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium">Total Internal Links</CardTitle>
            <Link2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{linkAnalysis?.totalLinks || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium">Avg Links/Page</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{linkAnalysis?.avgLinksPerPage || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium">Orphan Pages</CardTitle>
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{linkAnalysis?.orphanCount || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium">Broken Links</CardTitle>
            <AlertCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{linkAnalysis?.brokenLinkCount || 0}</div>
          </CardContent>
        </Card>
      </CardGroup>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              Orphan Content
            </CardTitle>
            <Select value={contentTypeFilter} onValueChange={setContentTypeFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="page">Pages</SelectItem>
                <SelectItem value="post">Posts</SelectItem>
                <SelectItem value="product">Products</SelectItem>
                <SelectItem value="category">Categories</SelectItem>
                <SelectItem value="directory">Directory</SelectItem>
                <SelectItem value="event">Events</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {filteredOrphanContent.length > 0 ? (
            <div className="space-y-2">
              {filteredOrphanContent.map((item: any, i: number) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <Badge variant="outline" className="text-xs capitalize">
                    {item.type}
                  </Badge>
                  <span className="font-medium">{item.title}</span>
                  <span className="text-muted-foreground">
                    /{item.type === "post" ? "posts" : item.type === "product" ? "products" : `${item.type}s`}/
                    {item.slug}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="flex items-center gap-1 text-sm text-muted-foreground">
              {orphanContent.length === 0 && <CheckCircle2 className="h-4 w-4 text-green-500" />}
              {orphanContent.length === 0
                ? "No orphan pages found. All content has at least one incoming internal link."
                : normalizedSearchQuery
                  ? "No orphan content matches your search."
                  : "No orphan content matches the current filters."}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-red-500" />
            Broken Internal Links
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredBrokenLinks.length > 0 ? (
            <div className="space-y-2">
              {filteredBrokenLinks.map((item: any, i: number) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <Badge variant="outline" className="text-xs capitalize">
                    {item.sourceType}
                  </Badge>
                  <span className="font-medium">{item.sourceTitle}</span>
                  <span className="text-muted-foreground">-&gt;</span>
                  <span className="text-red-500">{item.href}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="flex items-center gap-1 text-sm text-muted-foreground">
              {brokenLinks.length === 0 && <CheckCircle2 className="h-4 w-4 text-green-500" />}
              {brokenLinks.length === 0
                ? "No broken internal links found."
                : normalizedSearchQuery
                  ? "No broken links match your search."
                  : "No broken links match the current filters."}
            </p>
          )}
        </CardContent>
      </Card>
    </CardGroup>
  )
}
