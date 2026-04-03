'use client'

import { use, useEffect, useState, useCallback } from 'react'
import { AdminLayout } from '@/components/admin/layout/admin-layout'
import { getSiteAuditAdminTopNavLinks } from "@/components/admin/layout/dashboard/admin-top-nav-links"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { StickyHeader } from '@/components/admin/layout/dashboard/StickyHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Link2,
} from 'lucide-react'
import { getSiteForAudit, getInternalLinkAnalysis } from '@/lib/actions/site-audit/site-audit-actions'

interface PageProps {
  params: Promise<{ siteId: string }>
}

export default function InternalLinksPage({ params }: PageProps) {
  const { siteId } = use(params)

  const [loading, setLoading] = useState(true)
  const [site, setSite] = useState<any>(null)
  const [linkAnalysis, setLinkAnalysis] = useState<any>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [siteData, linkData] = await Promise.all([
        getSiteForAudit(siteId),
        getInternalLinkAnalysis(siteId),
      ])
      if (siteData) setSite(siteData)
      setLinkAnalysis(linkData)
    } catch (err) {
      console.error('Error loading link data:', err)
    }
    setLoading(false)
  }, [siteId])

  useEffect(() => { loadData() }, [loadData])

  return (
    <>
      <StickyHeader navLinks={getSiteAuditAdminTopNavLinks(siteId, "links")} />
      <AdminLayout>
        <DashboardSubheader
          items={[
            { label: 'Site Audit', href: `/admin/sites/${siteId}/site-audit` },
            { label: 'Internal Links' },
          ]}
        />

        {loading ? (
          <div className="pb-8">
            <div className="grid md:grid-cols-2 lg:grid-cols-4">
              {[...Array(4)].map((_, i) => (
                <Card key={i}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <Skeleton className="h-4 w-24" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-8 w-16" />
                  </CardContent>
                </Card>
              ))}
            </div>
            <Card>
              <CardHeader><Skeleton className="h-5 w-32" /></CardHeader>
              <CardContent className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="pb-8">
            {/* Stats */}
            <div className="grid md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Internal Links</CardTitle>
                  <Link2 className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{linkAnalysis?.totalLinks || 0}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Avg Links/Page</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{linkAnalysis?.avgLinksPerPage || 0}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Orphan Pages</CardTitle>
                  <AlertTriangle className="h-4 w-4 text-yellow-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{linkAnalysis?.orphanCount || 0}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Broken Links</CardTitle>
                  <AlertCircle className="h-4 w-4 text-red-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{linkAnalysis?.brokenLinkCount || 0}</div>
                </CardContent>
              </Card>
            </div>

            {/* Orphan content */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-yellow-500" />
                  Orphan Content
                </CardTitle>
              </CardHeader>
              <CardContent>
                {linkAnalysis?.orphanContent?.length > 0 ? (
                  <div className="space-y-2">
                    {linkAnalysis.orphanContent.map((item: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <Badge variant="outline" className="text-xs capitalize">{item.type}</Badge>
                        <span className="font-medium">{item.title}</span>
                        <span className="text-muted-foreground">
                          /{item.type === 'post' ? 'posts' : item.type === 'product' ? 'products' : item.type + 's'}/{item.slug}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    No orphan pages found. All content has at least one incoming internal link.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Broken links */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-red-500" />
                  Broken Internal Links
                </CardTitle>
              </CardHeader>
              <CardContent>
                {linkAnalysis?.brokenLinks?.length > 0 ? (
                  <div className="space-y-2">
                    {linkAnalysis.brokenLinks.map((item: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <Badge variant="outline" className="text-xs capitalize">{item.sourceType}</Badge>
                        <span className="font-medium">{item.sourceTitle}</span>
                        <span className="text-muted-foreground">&rarr;</span>
                        <span className="text-red-500">{item.href}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    No broken internal links found.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </AdminLayout>
    </>
  )
}
