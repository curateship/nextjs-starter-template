'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { getSiteForAudit } from '@/lib/actions/site-audit/site-audit-actions'
import { buildCanonicalUrl, getHomeSeoDescription, getHomeSeoTitle } from '@/lib/utils/seo-helpers'
import { toCdnUrl } from '@/lib/utils/cdn'

interface SearchPreviewTabProps {
  siteId: string
}

export function SearchPreviewTab({ siteId }: SearchPreviewTabProps) {
  const [loading, setLoading] = useState(true)
  const [site, setSite] = useState<any>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const siteData = await getSiteForAudit(siteId)
      setSite(siteData)
    } catch (error) {
      console.error('Error loading SEO preview:', error)
    }
    setLoading(false)
  }, [siteId])

  useEffect(() => {
    loadData()
  }, [loadData])

  const preview = useMemo(() => {
    if (!site) return null

    const title = getHomeSeoTitle(site)
    const description = getHomeSeoDescription(site)
    const url = buildCanonicalUrl(site, '/')
    const ogImage = site.settings?.seo_default_og_image ? toCdnUrl(site.settings.seo_default_og_image) : null

    return { title, description, url, ogImage }
  }, [site])

  if (loading) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-36 w-full" />
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!preview) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground">Unable to load SEO preview.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Home Page Search Result</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="max-w-2xl rounded-md border bg-background p-5">
            <p className="mb-1 truncate text-sm text-green-700">{preview.url}</p>
            <h3 className="mb-1 text-xl text-blue-700">{preview.title}</h3>
            <p className="line-clamp-2 text-sm leading-6 text-muted-foreground">{preview.description}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Home Page Social Card</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="max-w-xl overflow-hidden rounded-md border bg-background">
            {preview.ogImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview.ogImage} alt="" className="aspect-[1.91/1] w-full object-cover" />
            ) : (
              <div className="flex aspect-[1.91/1] items-center justify-center bg-muted text-sm text-muted-foreground">
                No default image
              </div>
            )}
            <div className="space-y-1 p-4">
              <p className="truncate text-xs uppercase text-muted-foreground">{new URL(preview.url).host}</p>
              <h3 className="font-medium">{preview.title}</h3>
              <p className="line-clamp-2 text-sm text-muted-foreground">{preview.description}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
