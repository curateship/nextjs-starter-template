"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AdminSidebarSettingsCard } from "@/components/admin/layout/settings/AdminSidebarSettingsCard"
import { QuickLinksSettingsCard } from "@/components/admin/layout/settings/QuickLinksSettingsCard"
import { Card, CardGroup, CardContent } from "@/components/ui/card"
import { useSaveStatus, type SaveStatus } from "@/components/admin/layout/builder/save-status"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { getSiteByIdAction, updateSiteAction, type Site } from "@/lib/actions/sites/site-actions"
import {
  resolveAdminSidebarSettings,
  serializeAdminSidebarSettings,
  type AdminSidebarSettings
} from "@/lib/utils/admin-sidebar"
import { normalizeSiteQuickLinks, type SiteQuickLink } from "@/lib/utils/site-quick-links"

interface SiteAdminSettingsTabProps {
  siteId: string
  mode: "sidebar" | "dashboard-quick-links"
  onStatusChange?: (status: { loading: boolean; saving: boolean; saveStatus: SaveStatus }) => void
}

export function SiteAdminSettingsTab({ siteId, mode, onStatusChange }: SiteAdminSettingsTabProps) {
  const { sites, currentSite, setCurrentSite } = useSiteSwitcher()
  const contextSite = useMemo(
    () => (currentSite?.id === siteId ? currentSite : sites.find((candidate) => candidate.id === siteId) || null),
    [currentSite, siteId, sites]
  )

  const [site, setSite] = useState<Site | null>(contextSite as Site | null)
  const [quickLinks, setQuickLinks] = useState<SiteQuickLink[]>(
    normalizeSiteQuickLinks(contextSite?.settings?.quick_links)
  )
  const [adminSidebar, setAdminSidebar] = useState<AdminSidebarSettings>(
    resolveAdminSidebarSettings(contextSite?.settings?.admin_sidebar, {
      siteId
    })
  )
  const quickLinksRef = useRef(quickLinks)
  const adminSidebarRef = useRef(adminSidebar)
  const [loading, setLoading] = useState(!contextSite)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useSaveStatus()

  useEffect(() => {
    onStatusChange?.({ loading, saving, saveStatus })
  }, [loading, onStatusChange, saveStatus, saving])

  useEffect(() => {
    if (contextSite) {
      const nextQuickLinks = normalizeSiteQuickLinks(contextSite.settings?.quick_links)
      const nextAdminSidebar = resolveAdminSidebarSettings(contextSite.settings?.admin_sidebar, {
        siteId
      })

      setSite(contextSite as Site)
      quickLinksRef.current = nextQuickLinks
      adminSidebarRef.current = nextAdminSidebar
      setQuickLinks(nextQuickLinks)
      setAdminSidebar(nextAdminSidebar)
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
          setError(result.error || "Site not found")
          return
        }

        const nextQuickLinks = normalizeSiteQuickLinks(result.data.settings?.quick_links)
        const nextAdminSidebar = resolveAdminSidebarSettings(result.data.settings?.admin_sidebar, {
          siteId
        })

        setSite(result.data)
        quickLinksRef.current = nextQuickLinks
        adminSidebarRef.current = nextAdminSidebar
        setQuickLinks(nextQuickLinks)
        setAdminSidebar(nextAdminSidebar)
      } catch (loadError) {
        if (!cancelled) {
          console.error("Error loading site admin settings:", loadError)
          setError("Failed to load settings")
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

  const updateCachedSiteSettings = useCallback(
    (settingsPatch: Record<string, unknown>) => {
      setSite((prev) =>
        prev
          ? {
              ...prev,
              settings: {
                ...prev.settings,
                ...settingsPatch
              }
            }
          : prev
      )

      const nextCurrentSite = contextSite ?? currentSite
      if (nextCurrentSite) {
        setCurrentSite({
          ...nextCurrentSite,
          settings: {
            ...nextCurrentSite.settings,
            ...settingsPatch
          }
        })
      }
    },
    [contextSite, currentSite, setCurrentSite]
  )

  const handleSave = useCallback(async () => {
    if (!site || saving) return false

    try {
      setSaving(true)
      setError(null)
      setSaveStatus("saving")

      const normalizedQuickLinks = normalizeSiteQuickLinks(quickLinksRef.current)
      const nextSettings =
        mode === "sidebar"
          ? {
              ...site.settings,
              admin_sidebar: serializeAdminSidebarSettings(adminSidebarRef.current)
            }
          : {
              ...site.settings,
              quick_links: normalizedQuickLinks
            }
      const { data, error: updateError } = await updateSiteAction(siteId, {
        settings: nextSettings
      })

      if (updateError) {
        setError(updateError)
        setSaveStatus("error", updateError)
        return false
      }

      if (data) {
        setSite(data)
        if (mode === "sidebar") {
          const nextAdminSidebar = resolveAdminSidebarSettings(data.settings?.admin_sidebar, {
            siteId
          })
          adminSidebarRef.current = nextAdminSidebar
          setAdminSidebar(nextAdminSidebar)
        } else {
          quickLinksRef.current = normalizedQuickLinks
          setQuickLinks(normalizedQuickLinks)
        }
        setCurrentSite({ ...(contextSite ?? currentSite ?? data), ...data })
        setSaveStatus("saved", "Settings saved")
        return true
      }

      return false
    } catch (saveError) {
      console.error("Error saving site admin settings:", saveError)
      setError("Failed to save settings")
      setSaveStatus("error", "Failed to save settings")
      return false
    } finally {
      setSaving(false)
    }
  }, [contextSite, currentSite, mode, saving, setCurrentSite, setSaveStatus, site, siteId])

  const handleAdminSidebarChange = useCallback(
    (nextSidebar: AdminSidebarSettings) => {
      adminSidebarRef.current = nextSidebar
      setAdminSidebar(nextSidebar)

      const nextAdminSidebar = serializeAdminSidebarSettings(nextSidebar)
      updateCachedSiteSettings({ admin_sidebar: nextAdminSidebar })
    },
    [updateCachedSiteSettings]
  )

  const handleQuickLinksChange = useCallback(
    (nextQuickLinks: SiteQuickLink[]) => {
      quickLinksRef.current = nextQuickLinks
      setQuickLinks(nextQuickLinks)

      const normalizedQuickLinks = normalizeSiteQuickLinks(nextQuickLinks)
      if (normalizedQuickLinks.length === nextQuickLinks.length) {
        updateCachedSiteSettings({ quick_links: normalizedQuickLinks })
      }
    },
    [updateCachedSiteSettings]
  )

  if (loading) {
    return (
      <Card>
        <CardContent>
          {[1, 2, 3].map((item) => (
            <div key={item} className="space-y-2">
              <div className="h-4 w-40 animate-pulse rounded bg-muted" />
              <div className="h-10 animate-pulse rounded bg-muted/60" />
            </div>
          ))}
        </CardContent>
      </Card>
    )
  }

  if (!site) {
    return (
      <Card>
        <CardContent>
          <p className="text-sm text-muted-foreground">Unable to load settings for this site.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <form
      id="site-admin-settings-form"
      className="contents"
      onSubmit={(event) => {
        event.preventDefault()
        handleSave()
      }}
    >
      <CardGroup className="grid">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}
        {mode === "sidebar" ? (
          <AdminSidebarSettingsCard
            config={adminSidebar}
            siteId={siteId}
            onConfigChange={handleAdminSidebarChange}
            onSave={handleSave}
          />
        ) : (
          <QuickLinksSettingsCard
            quickLinks={quickLinks}
            onQuickLinksChange={handleQuickLinksChange}
          />
        )}
      </CardGroup>
    </form>
  )
}
