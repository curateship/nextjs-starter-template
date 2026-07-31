"use client"

import { useCallback, useEffect, useState } from "react"
import AlertCircle from "lucide-react/dist/esm/icons/circle-alert.js"
import AlertTriangle from "lucide-react/dist/esm/icons/triangle-alert.js"
import CheckCircle2 from "lucide-react/dist/esm/icons/circle-check.js"
import ClipboardCheck from "lucide-react/dist/esm/icons/clipboard-check.js"
import { Badge } from "@/components/ui/badge"
import { Card, CardGroup, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { getSiteAuditData, getSiteForAudit } from "@/lib/actions/seo/site-audit/site-audit-actions"

interface ContentAuditTabProps {
  siteId: string
  searchQuery: string
}

export function ContentAuditTab({ siteId, searchQuery }: ContentAuditTabProps) {
  const [loading, setLoading] = useState(true)
  const [auditData, setAuditData] = useState<any[]>([])
  const [auditFilter, setAuditFilter] = useState("all")
  const [issueFilter, setIssueFilter] = useState("all")

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [siteData, contentData] = await Promise.all([getSiteForAudit({ data: { siteId: siteId } }), getSiteAuditData({ data: { siteId: siteId } })])
      if (siteData) setAuditData(contentData)
    } catch (err) {
      console.error("Error loading audit data:", err)
    }
    setLoading(false)
  }, [siteId])

  useEffect(() => {
    loadData()
  }, [loadData])

  const normalizedSearchQuery = searchQuery.trim().toLowerCase()
  const filteredContent = auditData.filter((item) => {
    if (auditFilter !== "all" && item.type !== auditFilter) return false
    if (issueFilter === "missing_meta" && item.meta_description) return false
    if (issueFilter === "missing_image" && (item.type === "page" || item.featured_image)) return false
    if (normalizedSearchQuery) {
      const searchText = [item.title, item.slug, item.type, item.meta_description]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()

      if (!searchText.includes(normalizedSearchQuery)) return false
    }
    return true
  })

  const totalContent = auditData.length
  const missingMeta = auditData.filter((i) => !i.meta_description).length
  const missingImage = auditData.filter((i) => i.type !== "page" && !i.featured_image).length
  const badTitles = auditData.filter((i) => {
    const len = (i.title || "").length
    return len < 30 || len > 60
  }).length

  if (loading) {
    return (
      <CardGroup className="grid">
        <CardGroup className="grid md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
              </CardHeader>
              <CardContent>
              </CardContent>
            </Card>
          ))}
        </CardGroup>
        <Card>
          <CardHeader>
          </CardHeader>
          <CardContent className="space-y-3">
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
            <CardTitle className="text-sm font-medium">Total Content</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalContent}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium">Missing Meta Desc</CardTitle>
            <AlertCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{missingMeta}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium">Missing Image</CardTitle>
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{missingImage}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium">Bad Title Length</CardTitle>
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{badTitles}</div>
          </CardContent>
        </Card>
      </CardGroup>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5" />
              Content Audit
            </CardTitle>
            <div className="flex items-center gap-2">
              <Select value={auditFilter} onValueChange={setAuditFilter}>
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
              <Tabs value={issueFilter} onValueChange={setIssueFilter}>
                <TabsList>
                  <TabsTrigger value="all">All</TabsTrigger>
                  <TabsTrigger value="missing_meta">Missing Meta Desc</TabsTrigger>
                  <TabsTrigger value="missing_image">Missing Image</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 font-medium">Name</th>
                  <th className="pb-2 font-medium">Type</th>
                  <th className="pb-2 font-medium">Title Length</th>
                  <th className="pb-2 font-medium">Meta Desc</th>
                  <th className="pb-2 font-medium">Image</th>
                </tr>
              </thead>
              <tbody>
                {filteredContent.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-muted-foreground">
                      {normalizedSearchQuery
                        ? "No content matches the current search."
                        : "No content matches the current filters."}
                    </td>
                  </tr>
                )}
                {filteredContent.slice(0, 50).map((item) => {
                  const titleLen = (item.title || "").length
                  const titleOk = titleLen >= 30 && titleLen <= 60
                  const titleLengthLabel =
                    titleLen < 30
                      ? `${titleLen} chars - needs ${30 - titleLen} more`
                      : titleLen > 60
                        ? `${titleLen} chars - ${titleLen - 60} over`
                        : `${titleLen} chars`
                  const hasMeta = !!item.meta_description
                  const hasImage = item.type === "page" || !!item.featured_image

                  return (
                    <tr key={item.id} className="border-b last:border-0">
                      <td className="py-2 pr-4">
                        <span className="font-medium">{item.title}</span>
                      </td>
                      <td className="py-2 pr-4">
                        <Badge variant="outline" className="text-xs capitalize">
                          {item.type}
                        </Badge>
                      </td>
                      <td className="py-2 pr-4">
                        <span className={titleOk ? "text-green-600 dark:text-green-400" : "text-yellow-600"}>{titleLengthLabel}</span>
                      </td>
                      <td className="py-2 pr-4">
                        {hasMeta ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500 dark:text-green-400" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-destructive" />
                        )}
                      </td>
                      <td className="py-2">
                        {hasImage ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500 dark:text-green-400" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-yellow-500" />
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {filteredContent.length > 50 && (
            <p className="pt-2 text-xs text-muted-foreground">Showing 50 of {filteredContent.length} items</p>
          )}
        </CardContent>
      </Card>
    </CardGroup>
  )
}
