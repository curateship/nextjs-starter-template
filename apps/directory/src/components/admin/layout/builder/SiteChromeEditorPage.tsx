"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "@/components/app-link"
import { useSearchParams } from "@/lib/navigation-client"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { useSaveStatus } from "@/components/admin/layout/builder/save-status"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { Navigation } from "@/components/admin/structure-builder/navigation/Navigation"
import { Footer } from "@/components/admin/structure-builder/Footer"
import { getSiteByIdAction, type SiteWithTheme } from "@/lib/actions/sites/site-actions"
import { updateSiteNavigationAction, updateSiteFooterAction } from "@/lib/actions/sites/site-actions"
import { BUILT_IN_NAVIGATION_ACTION_ITEM_IDS } from "@/lib/utils/navigation-action-items"
import {
  createDefaultNavigationAccountMenu,
  resolveSiteChrome,
  sanitizeFooterSettings,
  sanitizeNavigationSettings
} from "@/lib/utils/site-structure"

function createDefaultNavigation(publicAuthPagePath?: string | null) {
  return {
    logo: "",
    logoUrl: "/",
    links: [{ id: "link-default-0", text: "Home", url: "/" }],
    buttons: [],
    actionItemOrder: [...BUILT_IN_NAVIGATION_ACTION_ITEM_IDS],
    accountMenu: createDefaultNavigationAccountMenu(publicAuthPagePath),
    navigationStyle: "default",
    styleConfig: {
      default: {
        blurEffect: "light",
        containerWidth: "custom",
        showDarkModeToggle: true,
        showDarkModeToggleOnMobile: true
      }
    }
  }
}

const DEFAULT_FOOTER = {
  logo: "",
  logoUrl: "/",
  links: [{ id: "footer-link-default-0", text: "Home", url: "/" }],
  socialLinks: [],
  copyright: ""
}

interface SiteChromeEditorPageProps {
  siteId: string
  mode: "navigation" | "footer"
  publicAuthPagePath?: string | null
}

export function SiteChromeEditorPage({ siteId, mode, publicAuthPagePath }: SiteChromeEditorPageProps) {
  const searchParams = useSearchParams()
  const { currentSite, sites, setCurrentSite } = useSiteSwitcher()
  const defaultNavigation = useMemo(() => createDefaultNavigation(publicAuthPagePath), [publicAuthPagePath])
  const cachedSite = useMemo(
    () => sites.find((site) => site.id === siteId) || (currentSite?.id === siteId ? currentSite : null),
    [currentSite, siteId, sites]
  )

  const [site, setSite] = useState<SiteWithTheme | null>(cachedSite)
  const [loading, setLoading] = useState(!cachedSite)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useSaveStatus()
  const [navigationContent, setNavigationContent] = useState<Record<string, any>>(defaultNavigation)
  const [footerContent, setFooterContent] = useState<Record<string, any>>(DEFAULT_FOOTER)

  const returnTo = searchParams.get("returnTo")
  const safeReturnTo = returnTo?.startsWith("/admin/") ? returnTo : null
  const activeLabel = mode === "navigation" ? "Navigation" : "Footer"

  useEffect(() => {
    if (cachedSite) {
      setSite(cachedSite)
      const chrome = resolveSiteChrome(cachedSite.settings)
      setNavigationContent(
        sanitizeNavigationSettings(chrome.navigation || defaultNavigation, {
          publicAuthPagePath
        }) || defaultNavigation
      )
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
          setError(result.error || "Failed to load site")
          return
        }

        setSite(result.data)
        const chrome = resolveSiteChrome(result.data.settings)
        setNavigationContent(
          sanitizeNavigationSettings(chrome.navigation || defaultNavigation, {
            publicAuthPagePath
          }) || defaultNavigation
        )
        setFooterContent(chrome.footer || DEFAULT_FOOTER)
      } catch (loadError) {
        if (!cancelled) {
          console.error("Failed to load site chrome settings:", loadError)
          setError("Failed to load site")
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
  }, [cachedSite, defaultNavigation, publicAuthPagePath, siteId])

  const handleSave = async () => {
    if (!site) return

    try {
      setSaving(true)
      setError(null)
      setSaveStatus("saving")

      const nextNavigationContent =
        sanitizeNavigationSettings(navigationContent, {
          publicAuthPagePath
        }) || defaultNavigation
      const nextFooterContent = sanitizeFooterSettings(footerContent) || DEFAULT_FOOTER
      const result =
        mode === "navigation"
          ? await updateSiteNavigationAction(site.id, nextNavigationContent)
          : await updateSiteFooterAction(site.id, nextFooterContent)

      if (!result.success) {
        const message = result.error || "Failed to save changes"
        setError(message)
        setSaveStatus("error", message)
        return
      }

      const updatedSite: SiteWithTheme = {
        ...site,
        settings: {
          ...(site.settings || {}),
          ...(mode === "navigation" ? { navigation: nextNavigationContent } : { footer: nextFooterContent })
        }
      }

      if (mode === "navigation") {
        setNavigationContent(nextNavigationContent)
      } else {
        setFooterContent(nextFooterContent)
      }
      setSite(updatedSite)
      if (currentSite?.id === updatedSite.id) {
        setCurrentSite(updatedSite)
      }

      setSaveStatus("saved", `${activeLabel} saved`)
    } catch (saveError) {
      console.error(`Failed to save ${mode}:`, saveError)
      const message = `Failed to save ${activeLabel.toLowerCase()}`
      setError(message)
      setSaveStatus("error", message)
    } finally {
      setSaving(false)
    }
  }

  const persistNavigationContent = async (nextNavigationContent: Record<string, any>) => {
    if (!site) return false

    try {
      setSaving(true)
      setError(null)
      setSaveStatus("saving")

      const sanitizedNavigation =
        sanitizeNavigationSettings(nextNavigationContent, {
          publicAuthPagePath
        }) || defaultNavigation
      const result = await updateSiteNavigationAction(site.id, sanitizedNavigation)

      if (!result.success) {
        const message = result.error || "Failed to save changes"
        setError(message)
        setSaveStatus("error", message)
        return false
      }

      const updatedSite: SiteWithTheme = {
        ...site,
        settings: {
          ...(site.settings || {}),
          navigation: sanitizedNavigation
        }
      }

      setNavigationContent(sanitizedNavigation)
      setSite(updatedSite)
      if (currentSite?.id === updatedSite.id) {
        setCurrentSite(updatedSite)
      }

      setSaveStatus("saved", "Navigation saved")
      return true
    } catch (saveError) {
      console.error("Failed to save navigation:", saveError)
      setError("Failed to save navigation")
      setSaveStatus("error", "Failed to save navigation")
      return false
    } finally {
      setSaving(false)
    }
  }

  const persistFooterContent = async (nextFooterContent: Record<string, any>) => {
    if (!site) return false

    try {
      setSaving(true)
      setError(null)
      setSaveStatus("saving")

      const sanitizedFooter = sanitizeFooterSettings(nextFooterContent) || DEFAULT_FOOTER
      const result = await updateSiteFooterAction(site.id, sanitizedFooter)

      if (!result.success) {
        const message = result.error || "Failed to save changes"
        setError(message)
        setSaveStatus("error", message)
        return false
      }

      const updatedSite: SiteWithTheme = {
        ...site,
        settings: {
          ...(site.settings || {}),
          footer: sanitizedFooter
        }
      }

      setFooterContent(sanitizedFooter)
      setSite(updatedSite)
      if (currentSite?.id === updatedSite.id) {
        setCurrentSite(updatedSite)
      }

      setSaveStatus("saved", "Footer saved")
      return true
    } catch (saveError) {
      console.error("Failed to save footer:", saveError)
      setError("Failed to save footer")
      setSaveStatus("error", "Failed to save footer")
      return false
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <StickyHeader />
      <AdminLayout>
        <div className="w-full pb-8">
          <DashboardSubheader
            items={[
              {
                label: site?.name || "Site",
                href: `/admin/dashboard/${siteId}`
              },
              { label: "Structure", href: `/admin/sites/${siteId}/pages` },
              { label: activeLabel }
            ]}
            saveStatus={saveStatus}
            isSaving={saving}
            onSave={handleSave}
            saveLabel="Save"
            savingLabel="Saving..."
            saveVariant="default"
            actions={safeReturnTo ? (
              <div className="flex items-center gap-2">
                <Button variant="outline" asChild>
                  <Link href={safeReturnTo}>Back to Builder</Link>
                </Button>
              </div>
            ) : undefined}
          />

          {error && (
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {loading ? (
            <Card>
              <CardContent className="space-y-4">
                <div className="h-8 w-48 animate-pulse rounded bg-muted" />
                <div className="h-48 animate-pulse rounded bg-muted/60" />
                <div className="h-48 animate-pulse rounded bg-muted/40" />
              </CardContent>
            </Card>
          ) : !site ? (
            <Card>
              <CardContent>
                <p className="text-sm text-muted-foreground">Unable to load structure settings for this site.</p>
              </CardContent>
            </Card>
          ) : mode === "navigation" ? (
            <Navigation
              content={navigationContent}
              onContentChange={(field, value) => {
                setNavigationContent((prev) => ({ ...prev, [field]: value }))
              }}
              onContentPersist={persistNavigationContent}
              blockId="site-structure-navigation"
              siteFavicon={site.settings?.favicon}
            />
          ) : (
            <Footer
              content={footerContent}
              onContentChange={(field, value) => {
                setFooterContent((prev) => ({ ...prev, [field]: value }))
              }}
              onContentPersist={persistFooterContent}
              siteFavicon={site.settings?.favicon}
              siteName={site.name}
            />
          )}
        </div>
      </AdminLayout>
    </>
  )
}
