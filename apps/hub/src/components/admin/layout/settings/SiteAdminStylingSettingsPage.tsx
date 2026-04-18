'use client'

import { useEffect, useMemo, useState } from 'react'
import { CheckCircle } from 'lucide-react'
import { AdminLayout } from '@/components/admin/layout/admin-layout'
import { DashboardSubheader } from '@/components/admin/layout/dashboard/DashboardSubheader'
import { StickyHeader } from '@/components/admin/layout/stickybar/StickyHeader'
import { FeatureTogglesCard } from '@/components/admin/layout/dashboard/FeatureTogglesCard'
import { SiteSettingsHeaderNav } from '@/components/admin/layout/settings/SiteSettingsHeaderNav'
import { QuickLinksSettingsCard } from '@/components/admin/layout/settings/QuickLinksSettingsCard'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useSiteSwitcher } from '@/components/admin/layout/providers/site-switcher-provider'
import {
  getSiteByIdAction,
  updateSiteAction,
  type Site,
} from '@/lib/actions/sites/site-actions'
import { normalizeSiteQuickLinks, type SiteQuickLink } from '@/lib/utils/site-quick-links'

interface SiteAdminStylingSettingsPageProps {
  siteId: string
}

export function SiteAdminStylingSettingsPage({ siteId }: SiteAdminStylingSettingsPageProps) {
  const { sites, currentSite, setCurrentSite } = useSiteSwitcher()
  const contextSite = useMemo(
    () => sites.find((candidate) => candidate.id === siteId) || (currentSite?.id === siteId ? currentSite : null),
    [currentSite, siteId, sites]
  )

  const [site, setSite] = useState<Site | null>(contextSite as Site | null)
  const [quickLinks, setQuickLinks] = useState<SiteQuickLink[]>(
    normalizeSiteQuickLinks(contextSite?.settings?.quick_links)
  )
  const [enabledFeatures, setEnabledFeatures] = useState<Record<string, boolean>>(
    contextSite?.settings?.enabled_features || {}
  )
  const [featureOrder, setFeatureOrder] = useState<string[]>(
    contextSite?.settings?.feature_order || []
  )
  const [loading, setLoading] = useState(!contextSite)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  useEffect(() => {
    if (contextSite) {
      setSite(contextSite as Site)
      setQuickLinks(normalizeSiteQuickLinks(contextSite.settings?.quick_links))
      setEnabledFeatures(contextSite.settings?.enabled_features || {})
      setFeatureOrder(contextSite.settings?.feature_order || [])
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
        setQuickLinks(normalizeSiteQuickLinks(result.data.settings?.quick_links))
        setEnabledFeatures(result.data.settings?.enabled_features || {})
        setFeatureOrder(result.data.settings?.feature_order || [])
      } catch (loadError) {
        if (!cancelled) {
          console.error('Error loading admin styling settings:', loadError)
          setError('Failed to load admin styling settings')
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
  }, [contextSite, siteId])

  const handleSave = async () => {
    if (!site) return

    try {
      setIsSubmitting(true)
      setError(null)
      setSaveMessage(null)

      const normalizedQuickLinks = normalizeSiteQuickLinks(quickLinks)
      const { data, error: updateError } = await updateSiteAction(siteId, {
        settings: {
          ...site.settings,
          quick_links: normalizedQuickLinks,
          enabled_features: enabledFeatures,
          feature_order: featureOrder,
        },
      })

      if (updateError) {
        setError(updateError)
        return
      }

      if (data) {
        setSite(data)
        setQuickLinks(normalizedQuickLinks)
        if (currentSite?.id === siteId) {
          setCurrentSite({ ...currentSite, ...data })
        }
        setSaveMessage('Settings saved successfully')
        window.setTimeout(() => setSaveMessage(null), 3000)
      }
    } catch (saveError) {
      console.error('Error saving admin styling settings:', saveError)
      setError('Failed to save settings. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <StickyHeader navContent={<SiteSettingsHeaderNav siteId={siteId} activeSection="admin-styling" />} />
      <AdminLayout>
        <div className="w-full pb-8">
          <DashboardSubheader
            items={[
              { label: site?.name || 'Site', href: `/admin/sites/${siteId}/dashboard` },
              { label: 'General Settings', href: `/admin/sites/${siteId}/settings` },
              { label: 'Admin Styling' },
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
                {[1, 2, 3].map((item) => (
                  <div key={item} className="space-y-2">
                    <div className="h-4 w-40 animate-pulse rounded bg-muted" />
                    <div className="h-10 animate-pulse rounded bg-muted/60" />
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : !site ? (
            <Card>
              <CardContent className="p-6">
                <p className="text-sm text-muted-foreground">Unable to load admin styling settings for this site.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              <FeatureTogglesCard
                enabledFeatures={enabledFeatures}
                onEnabledFeaturesChange={setEnabledFeatures}
                featureOrder={featureOrder}
                onFeatureOrderChange={setFeatureOrder}
              />
              <QuickLinksSettingsCard
                quickLinks={quickLinks}
                onQuickLinksChange={setQuickLinks}
              />
            </div>
          )}
        </div>
      </AdminLayout>
    </>
  )
}
