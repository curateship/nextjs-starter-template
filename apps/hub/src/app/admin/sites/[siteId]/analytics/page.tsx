'use client'

import { use, useEffect, useState, useCallback } from 'react'
import { AdminLayout } from '@/components/admin/layout/admin-layout'
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { StickyHeader } from '@/components/admin/layout/stickybar/StickyHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

import { Users, Globe, ArrowUpRight } from 'lucide-react'
import {
  getAnalyticsOverview,
  getTopPages,
  getTopReferrers,
  getTrafficOverTime,
} from '@/lib/actions/analytics/analytics-actions'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

interface PageProps {
  params: Promise<{ siteId: string }>
}

const PERIODS = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: '7d', label: '7 Days' },
  { id: '30d', label: '30 Days' },
] as const

type Period = (typeof PERIODS)[number]['id']

export default function AnalyticsPage({ params }: PageProps) {
  const { siteId } = use(params)
  const [period, setPeriod] = useState<Period>('7d')
  const [loading, setLoading] = useState(true)
  const [overview, setOverview] = useState({ pageViews: 0, uniqueVisitors: 0 })
  const [topPages, setTopPages] = useState<{ path: string; views: number }[]>([])
  const [topReferrers, setTopReferrers] = useState<{ domain: string; visits: number }[]>([])
  const [traffic, setTraffic] = useState<{ date: string; views: number; visitors: number }[]>([])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [overviewData, pagesData, referrersData, trafficData] = await Promise.all([
        getAnalyticsOverview(siteId, period),
        getTopPages(siteId, period),
        getTopReferrers(siteId, period),
        getTrafficOverTime(siteId, period),
      ])
      setOverview(overviewData)
      setTopPages(pagesData)
      setTopReferrers(referrersData)
      setTraffic(trafficData)
    } catch (err) {
      console.error('Failed to load analytics:', err)
    } finally {
      setLoading(false)
    }
  }, [siteId, period])

  useEffect(() => { loadData() }, [loadData])

  return (
    <>
      <StickyHeader />
      <AdminLayout>
        <div className="w-full">
          <DashboardSubheader
            items={[
              { label: "Sites", href: "/admin/sites" },
              { label: "Analytics" },
            ]}
            filterMenu={{
              value: period,
              onValueChange: (v) => setPeriod(v as Period),
              items: PERIODS.map(p => ({ value: p.id, label: p.label })),
            }}
            preActions={
              <span className="text-sm text-muted-foreground">
                {period === 'today' && new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                {period === 'yesterday' && new Date(Date.now() - 86400000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                {period === '7d' && `${new Date(Date.now() - 7 * 86400000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                {period === '30d' && `${new Date(Date.now() - 30 * 86400000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
              </span>
            }
          />
      {/* Stats Grid */}
      <div className="grid md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Daily Visitors</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? <div className="h-8 w-20 bg-muted rounded animate-pulse" /> : (
              <div className="text-2xl font-bold">{overview.uniqueVisitors.toLocaleString()}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Page Views</CardTitle>
            <Globe className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? <div className="h-8 w-20 bg-muted rounded animate-pulse" /> : (
              <div className="text-2xl font-bold">{overview.pageViews.toLocaleString()}</div>
            )}
          </CardContent>
        </Card>
      </div>

              {/* Traffic Chart */}
              {traffic.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Traffic Over Time</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={traffic}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis dataKey="date" className="text-xs" tick={{ fontSize: 12 }} />
                          <YAxis className="text-xs" tick={{ fontSize: 12 }} />
                          <Tooltip />
                          <Line type="monotone" dataKey="views" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Views" />
                          <Line type="monotone" dataKey="visitors" stroke="hsl(var(--muted-foreground))" strokeWidth={2} dot={false} name="Visitors" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Top Pages & Referrers */}
              <div className="grid lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Top Pages</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {loading ? (
                      <div className="space-y-3">
                        {[1, 2, 3, 4].map(i => (
                          <div key={i} className="flex items-center justify-between">
                            <div className="h-4 w-32 bg-muted rounded animate-pulse" />
                            <div className="h-4 w-16 bg-muted rounded animate-pulse" />
                          </div>
                        ))}
                      </div>
                    ) : topPages.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No data yet</p>
                    ) : (
                      <div className="space-y-3">
                        {topPages.map((page, i) => (
                          <div key={i} className="flex items-center justify-between">
                            <span className="text-sm truncate mr-4">{page.path}</span>
                            <span className="text-sm text-muted-foreground whitespace-nowrap">{page.views.toLocaleString()} views</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Top Referrers</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {loading ? (
                      <div className="space-y-3">
                        {[1, 2, 3, 4].map(i => (
                          <div key={i} className="flex items-center justify-between">
                            <div className="h-4 w-32 bg-muted rounded animate-pulse" />
                            <div className="h-4 w-16 bg-muted rounded animate-pulse" />
                          </div>
                        ))}
                      </div>
                    ) : topReferrers.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No referrer data yet</p>
                    ) : (
                      <div className="space-y-3">
                        {topReferrers.map((ref, i) => (
                          <div key={i} className="flex items-center justify-between">
                            <div className="flex items-center gap-2 min-w-0">
                              <ArrowUpRight className="h-3 w-3 text-muted-foreground shrink-0" />
                              <span className="text-sm truncate">{ref.domain}</span>
                            </div>
                            <span className="text-sm text-muted-foreground whitespace-nowrap">{ref.visits.toLocaleString()} visits</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

        </div>
      </AdminLayout>
    </>
  )
}
