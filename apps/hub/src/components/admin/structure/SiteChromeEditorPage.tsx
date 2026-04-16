"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { CheckCircle } from "lucide-react"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { StickyHeader } from "@/components/admin/layout/dashboard/StickyHeader"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useSiteSwitcher } from "@/components/admin/providers/site-switcher-provider"
import { getPageAdminTopNavLinks } from "@/components/admin/layout/dashboard/admin-top-nav-links"
import { PageNavigationBlock } from "@/components/admin/page-builder/blocks/navigation/PageNavigationBlock"
import { PageFooterBlock } from "@/components/admin/page-builder/blocks/footer/PageFooterBlock"
import { getSiteByIdAction, type SiteWithTheme } from "@/lib/actions/sites/site-actions"
import { updateSiteNavigationAction, updateSiteFooterAction } from "@/lib/actions/sites/site-actions"
import { resolveSiteChrome } from "@/lib/utils/site-structure"

const DEFAULT_NAVIGATION = {
  logo: '',
  logoUrl: '/',
  links: [{ id: 'link-default-0', text: 'Home', url: '/' }],
  buttons: [],
  showAuthenticatedUserMenu: false,
  navigationStyle: 'default',
  styleConfig: {
    default: {
      textColor: '',
      blurEffect: 'light',
      containerWidth: 'custom',
      backgroundColor: '',
      showDarkModeToggle: true,
    },
  },
}

const DEFAULT_FOOTER = {
  logo: '',
  logoUrl: '/',
  links: [{ id: 'footer-link-default-0', text: 'Home', url: '/' }],
  socialLinks: [],
  copyright: '© All rights reserved.',
  style: { backgroundColor: '', textColor: '#6c757d' },
}

interface SiteChromeEditorPageProps {
  siteId: string
  mode: 'navigation' | 'footer'
}

export function SiteChromeEditorPage({ siteId, mode }: SiteChromeEditorPageProps) {
  const searchParams = useSearchParams()
  const { currentSite, sites, setCurrentSite } = useSiteSwitcher()
  const cachedSite = useMemo(
    () => sites.find(site => site.id === siteId) || (currentSite?.id === siteId ? currentSite : null),
    [currentSite, siteId, sites]
  )

  const [site, setSite] = useState<SiteWithTheme | null>(cachedSite)
  const [loading, setLoading] = useState(!cachedSite)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState("")
  const [navigationContent, setNavigationContent] = useState<Record<string, any>>(DEFAULT_NAVIGATION)
  const [footerContent, setFooterContent] = useState<Record<string, any>>(DEFAULT_FOOTER)

  const returnTo = searchParams.get('returnTo')
  const safeReturnTo = returnTo?.startsWith('/admin/') ? returnTo : null
  const activeLabel = mode === 'navigation' ? 'Navigation' : 'Footer'

  useEffect(() => {
    if (cachedSite) {
      setSite(cachedSite)
      const chrome = resolveSiteChrome(cachedSite.settings)
      setNavigationContent(chrome.navigation || DEFAULT_NAVIGATION)
      setFooterContent(chrome.footer || DEFAULT_FOOTER)
      setLoading(false)
      return
    }

    let cancelled = false

    async function loadSite() {
      try {
        setLoading(true)
        setError(null)
        const result = await getSiteByIdAction(siteId)

        if (cancelled) return
        if (!result.data) {
          setError(result.error || 'Failed to load site')
          return
        }

        setSite(result.data)
        const chrome = resolveSiteChrome(result.data.settings)
        setNavigationContent(chrome.navigation || DEFAULT_NAVIGATION)
        setFooterContent(chrome.footer || DEFAULT_FOOTER)
      } catch (loadError) {
        if (!cancelled) {
          console.error('Failed to load site chrome settings:', loadError)
          setError('Failed to load site')
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
  }, [cachedSite, siteId])

  const handleSave = async () => {
    if (!site) return

    try {
      setSaving(true)
      setError(null)
      setSaveMessage("")

      const result = mode === 'navigation'
        ? await updateSiteNavigationAction(site.id, navigationContent)
        : await updateSiteFooterAction(site.id, footerContent)

      if (!result.success) {
        setError(result.error || 'Failed to save changes')
        return
      }

      const updatedSite: SiteWithTheme = {
        ...site,
        settings: {
          ...(site.settings || {}),
          ...(mode === 'navigation'
            ? { navigation: navigationContent }
            : { footer: footerContent }),
        },
      }

      setSite(updatedSite)
      if (currentSite?.id === updatedSite.id) {
        setCurrentSite(updatedSite)
      }

      setSaveMessage(`${activeLabel} saved`)
      window.setTimeout(() => setSaveMessage(""), 3000)
    } catch (saveError) {
      console.error(`Failed to save ${mode}:`, saveError)
      setError(`Failed to save ${activeLabel.toLowerCase()}`)
    } finally {
      setSaving(false)
    }
  }

  const persistNavigationContent = async (nextNavigationContent: Record<string, any>) => {
    if (!site) return false

    try {
      setSaving(true)
      setError(null)
      setSaveMessage("")

      const result = await updateSiteNavigationAction(site.id, nextNavigationContent)

      if (!result.success) {
        setError(result.error || "Failed to save changes")
        return false
      }

      const updatedSite: SiteWithTheme = {
        ...site,
        settings: {
          ...(site.settings || {}),
          navigation: nextNavigationContent,
        },
      }

      setNavigationContent(nextNavigationContent)
      setSite(updatedSite)
      if (currentSite?.id === updatedSite.id) {
        setCurrentSite(updatedSite)
      }

      setSaveMessage("Navigation saved")
      window.setTimeout(() => setSaveMessage(""), 3000)
      return true
    } catch (saveError) {
      console.error("Failed to save navigation:", saveError)
      setError("Failed to save navigation")
      return false
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <StickyHeader navLinks={getPageAdminTopNavLinks(siteId, mode)} />
      <AdminLayout>
        <div className="w-full pb-8">
          <DashboardSubheader
            items={[
              { label: site?.name || 'Site', href: `/admin/sites/${siteId}/dashboard` },
              { label: 'Structure', href: `/admin/sites/${siteId}/pages` },
              { label: activeLabel },
            ]}
            actions={
              <div className="flex items-center gap-2">
                {safeReturnTo && (
                  <Button variant="outline" asChild>
                    <Link href={safeReturnTo}>Back to Builder</Link>
                  </Button>
                )}
                {saveMessage && (
                  <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-1.5">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span className="text-sm font-medium text-green-700">{saveMessage}</span>
                  </div>
                )}
                <Button onClick={saving ? undefined : handleSave}>
                  {saving ? 'Saving...' : 'Save Changes'}
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
                <div className="h-8 w-48 animate-pulse rounded bg-muted" />
                <div className="h-48 animate-pulse rounded bg-muted/60" />
                <div className="h-48 animate-pulse rounded bg-muted/40" />
              </CardContent>
            </Card>
          ) : !site ? (
            <Card>
              <CardContent className="p-6">
                <p className="text-sm text-muted-foreground">Unable to load structure settings for this site.</p>
              </CardContent>
            </Card>
          ) : mode === 'navigation' ? (
            <PageNavigationBlock
              content={navigationContent}
              onContentChange={(field, value) => {
                setNavigationContent(prev => ({ ...prev, [field]: value }))
              }}
              onContentPersist={persistNavigationContent}
              siteId={site.id}
              blockId="site-structure-navigation"
              siteFavicon={site.settings?.favicon}
            />
          ) : (
            <PageFooterBlock
              logo={footerContent.logo || ''}
              logoUrl={footerContent.logoUrl || '/'}
              links={footerContent.links || []}
              socialLinks={footerContent.socialLinks || []}
              style={footerContent.style || { backgroundColor: '', textColor: '#6c757d' }}
              visibility={footerContent.visibility}
              onLogoChange={(value) => setFooterContent(prev => ({ ...prev, logo: value }))}
              onLogoUrlChange={(value) => setFooterContent(prev => ({ ...prev, logoUrl: value }))}
              onLinksChange={(value) => setFooterContent(prev => ({ ...prev, links: value }))}
              onSocialLinksChange={(value) => setFooterContent(prev => ({ ...prev, socialLinks: value }))}
              onStyleChange={(value) => setFooterContent(prev => ({ ...prev, style: value }))}
              onVisibilityChange={(value) => setFooterContent(prev => ({ ...prev, visibility: value }))}
              siteId={site.id}
              blockId="site-structure-footer"
              siteFavicon={site.settings?.favicon}
              siteName={site.name}
            />
          )}
        </div>
      </AdminLayout>
    </>
  )
}
