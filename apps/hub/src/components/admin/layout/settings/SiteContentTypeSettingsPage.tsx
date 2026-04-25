'use client'

import { useEffect, useMemo, useState } from 'react'
import { CheckCircle } from 'lucide-react'
import { AdminLayout } from '@/components/admin/layout/admin-layout'
import { DashboardSubheader } from '@/components/admin/layout/dashboard/DashboardSubheader'
import { StickyHeader } from '@/components/admin/layout/stickybar/StickyHeader'
import { SiteSettingsHeaderNav } from '@/components/admin/layout/settings/SiteSettingsHeaderNav'
import { ContentTypeDefaultBlocksCard } from '@/components/admin/layout/settings/ContentTypeDefaultBlocksCard'
import { getSiteSettingsContentTypeBySlug } from '@/components/admin/layout/settings/site-settings-content-types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useSiteSwitcher } from '@/components/admin/layout/providers/site-switcher-provider'
import {
  getSiteByIdAction,
  updateSiteAction,
  type Site,
} from '@/lib/actions/sites/site-actions'

interface SiteContentTypeSettingsPageProps {
  siteId: string
  contentTypeSlug: string
}

const BREADCRUMB_CONTENT_TYPE_KEYS = new Set(['posts', 'products', 'directories', 'events', 'categories'])

function getBreadcrumbVisibility(settings: Record<string, any> | undefined, contentTypeKey: string) {
  return settings?.breadcrumbs?.[contentTypeKey] !== false
}

export function SiteContentTypeSettingsPage({
  siteId,
  contentTypeSlug,
}: SiteContentTypeSettingsPageProps) {
  const contentType = getSiteSettingsContentTypeBySlug(contentTypeSlug)
  const contentTypeKey = contentType?.key || ''
  const { sites, currentSite, setCurrentSite } = useSiteSwitcher()
  const contextSite = useMemo(
    () => sites.find((candidate) => candidate.id === siteId) || (currentSite?.id === siteId ? currentSite : null),
    [currentSite, siteId, sites]
  )

  const [site, setSite] = useState<Site | null>(contextSite as Site | null)
  const [selectedBlocks, setSelectedBlocks] = useState<string[]>(
    Array.isArray(contextSite?.settings?.default_blocks?.[contentTypeKey])
      ? contextSite.settings.default_blocks[contentTypeKey]
      : []
  )
  const [showBreadcrumbs, setShowBreadcrumbs] = useState(
    getBreadcrumbVisibility(contextSite?.settings, contentTypeKey)
  )
  const [loading, setLoading] = useState(!contextSite)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  useEffect(() => {
    if (contextSite) {
      setSite(contextSite as Site)
      setSelectedBlocks(
        Array.isArray(contextSite.settings?.default_blocks?.[contentTypeKey])
          ? contextSite.settings.default_blocks[contentTypeKey]
          : []
      )
      setShowBreadcrumbs(getBreadcrumbVisibility(contextSite.settings, contentTypeKey))
      setLoading(false)
      return
    }

    let cancelled = false

    const loadSite = async () => {
      try {
        setLoading(true)
        setError(null)

        const result = await getSiteByIdAction(siteId)

        if (cancelled) return

        if (result.error || !result.data) {
          setError(result.error || 'Site not found')
          return
        }

        setSite(result.data)
        setSelectedBlocks(
          Array.isArray(result.data.settings?.default_blocks?.[contentTypeKey])
            ? result.data.settings.default_blocks[contentTypeKey]
            : []
        )
        setShowBreadcrumbs(getBreadcrumbVisibility(result.data.settings, contentTypeKey))
      } catch (loadError) {
        if (!cancelled) {
          console.error('Error loading site settings:', loadError)
          setError('Failed to load site settings')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadSite()

    return () => {
      cancelled = true
    }
  }, [contentTypeKey, contextSite, siteId])

  const handleSave = async () => {
    if (!site) return

    try {
      setIsSubmitting(true)
      setError(null)
      setSaveMessage(null)

      const currentDefaultBlocks = { ...((site.settings?.default_blocks as Record<string, string[]> | undefined) || {}) }
      const currentBreadcrumbs = { ...((site.settings?.breadcrumbs as Record<string, boolean> | undefined) || {}) }
      const nextSettings: Record<string, any> = {
        ...site.settings,
        default_blocks: {
          ...currentDefaultBlocks,
          [contentTypeKey]: selectedBlocks,
        },
      }

      if (BREADCRUMB_CONTENT_TYPE_KEYS.has(contentTypeKey)) {
        nextSettings.breadcrumbs = {
          ...currentBreadcrumbs,
          [contentTypeKey]: showBreadcrumbs,
        }
      }

      const { data, error: updateError } = await updateSiteAction(siteId, {
        settings: nextSettings,
      })

      if (updateError) {
        setError(updateError)
        return
      }

      if (data) {
        setSite(data)
        if (currentSite?.id === siteId) {
          setCurrentSite({ ...currentSite, ...data })
        }
        setSaveMessage('Settings saved successfully')
        window.setTimeout(() => setSaveMessage(null), 3000)
      }
    } catch (saveError) {
      console.error('Error saving content type settings:', saveError)
      setError('Failed to save settings. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!contentType) {
    return null
  }

  return (
    <>
      <StickyHeader
        navContent={
          <SiteSettingsHeaderNav
            siteId={siteId}
            activeSection="content-types"
            activeContentTypeSlug={contentType.slug}
          />
        }
      />
      <AdminLayout>
        <div className="w-full pb-8">
          <DashboardSubheader
            items={[
              { label: site?.name || 'Site', href: `/admin/sites/${siteId}/dashboard` },
              { label: 'General Settings', href: `/admin/sites/${siteId}/settings` },
              { label: contentType.label },
            ]}
            actions={
              <div className="flex items-center gap-2">
                {saveMessage && (
                  <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-1.5">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span className="text-sm font-medium text-green-700">{saveMessage}</span>
                  </div>
                )}
                <Button onClick={isSubmitting ? undefined : handleSave}>
                  {isSubmitting ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            }
          />

          {error && (
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {loading ? (
            <Card>
              <CardContent className="space-y-4 p-6">
                {[1, 2, 3, 4].map((item) => (
                  <div key={item} className="flex items-center justify-between gap-4">
                    <div className="space-y-2">
                      <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                      <div className="h-3 w-64 animate-pulse rounded bg-muted/60" />
                    </div>
                    <div className="h-6 w-11 animate-pulse rounded-full bg-muted" />
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : !site ? (
            <Card>
              <CardContent className="p-6">
                <p className="text-sm text-muted-foreground">Unable to load settings for this site.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {BREADCRUMB_CONTENT_TYPE_KEYS.has(contentTypeKey) && (
                <Card>
                  <CardHeader>
                    <CardTitle>Frontend Breadcrumbs</CardTitle>
                    <CardDescription>
                      Show the primary category path on this content type.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between gap-4">
                      <div className="space-y-1">
                        <Label htmlFor="show-breadcrumbs" className="font-medium">
                          Show breadcrumbs
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Uses the selected primary category for each item.
                        </p>
                      </div>
                      <Switch
                        id="show-breadcrumbs"
                        checked={showBreadcrumbs}
                        onCheckedChange={setShowBreadcrumbs}
                      />
                    </div>
                  </CardContent>
                </Card>
              )}

              <ContentTypeDefaultBlocksCard
                contentType={contentType}
                selectedBlocks={selectedBlocks}
                onSelectedBlocksChange={setSelectedBlocks}
              />
            </div>
          )}
        </div>
      </AdminLayout>
    </>
  )
}
