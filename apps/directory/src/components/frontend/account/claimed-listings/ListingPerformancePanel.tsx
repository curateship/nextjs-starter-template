"use client"

import { useEffect, useState } from "react"
import Loader2 from "lucide-react/dist/esm/icons/loader-circle.js"
import TrendingUp from "lucide-react/dist/esm/icons/trending-up.js"
import Sparkles from "lucide-react/dist/esm/icons/sparkles.js"

import {
  getMyListingViewsAnalyticsAction,
  type ListingAnalyticsRange,
  type ListingViewsAnalytics,
} from "@/lib/actions/analytics/listing-analytics-actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ListingViewsChart } from "./ListingViewsChart"

interface ListingPerformancePanelProps {
  siteId: string
  directoryId: string
  isFeatured: boolean
  canUpgrade: boolean
  onGetFeatured: () => void
}

const RANGE_LABEL: Record<ListingAnalyticsRange, string> = {
  "30d": "last 30 days",
  "90d": "last 90 days",
}

function getPercentChange(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : 100
  return ((current - previous) / previous) * 100
}

export function ListingPerformancePanel({
  siteId,
  directoryId,
  isFeatured,
  canUpgrade,
  onGetFeatured,
}: ListingPerformancePanelProps) {
  const [range, setRange] = useState<ListingAnalyticsRange>("30d")
  const [analytics, setAnalytics] = useState<ListingViewsAnalytics | null>(null)
  const [loading, setLoading] = useState(true)

  // Switching to a different listing clears the previous listing's numbers so they
  // never show under the new listing while its request is in flight. A range toggle
  // keeps the current data and just refreshes it (a small header spinner).
  useEffect(() => {
    setAnalytics(null)
  }, [directoryId])

  // A cancelled flag so an out-of-order response never overwrites a newer one.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getMyListingViewsAnalyticsAction({ data: { siteId, directoryId, range } })
      .then((result) => {
        if (cancelled) return
        setAnalytics(result)
      })
      .catch(() => {
        if (!cancelled) setAnalytics(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [siteId, directoryId, range])

  const change = analytics ? getPercentChange(analytics.totalViews, analytics.previousTotalViews) : 0
  const changeUp = change >= 0
  const hasViews = !!analytics && analytics.totalViews > 0

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              Listing Performance
              {loading && analytics ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : null}
            </CardTitle>
            <CardDescription>How many people viewed this listing.</CardDescription>
          </div>
          <Tabs value={range} onValueChange={(value) => setRange(value as ListingAnalyticsRange)}>
            <TabsList>
              <TabsTrigger value="30d">30 days</TabsTrigger>
              <TabsTrigger value="90d">90 days</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent className="gap-4">
        {loading && !analytics ? (
          <div className="flex h-48 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : analytics?.error ? (
          <p role="alert" className="text-sm text-destructive">
            {analytics.error}
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-3xl font-bold tracking-tight">
                {(analytics?.totalViews ?? 0).toLocaleString()}
              </span>
              <span className="text-sm text-muted-foreground">
                views in the {RANGE_LABEL[range]}
              </span>
              {hasViews ? (
                <span
                  className={`inline-flex items-center gap-1 text-xs font-semibold ${changeUp ? "text-green-600" : "text-red-600"}`}
                >
                  <TrendingUp className={`h-3.5 w-3.5 ${changeUp ? "" : "rotate-180"}`} />
                  {changeUp ? "+" : ""}
                  {change.toFixed(0)}%
                  <span className="font-normal text-muted-foreground">vs previous</span>
                </span>
              ) : null}
            </div>

            {hasViews ? (
              <>
                <ListingViewsChart series={analytics!.series} />
                <p className="text-xs text-muted-foreground">
                  Busiest day: {analytics!.peakViews.toLocaleString()}{" "}
                  {analytics!.peakViews === 1 ? "view" : "views"}.
                </p>
              </>
            ) : (
              <div className="rounded-lg border border-dashed px-4 py-10 text-center">
                <p className="text-sm font-medium">No views in the {RANGE_LABEL[range]} yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  View numbers appear here once visitors open your listing.
                </p>
              </div>
            )}

            {canUpgrade && !isFeatured ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/40 px-4 py-3">
                <div className="flex items-start gap-2">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Featured listings show first in search and category pages — a simple way to turn more visits into views.
                  </p>
                </div>
                <Button type="button" variant="outline" onClick={onGetFeatured}>
                  Get Featured
                </Button>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  )
}
