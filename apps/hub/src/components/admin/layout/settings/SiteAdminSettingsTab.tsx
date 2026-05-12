"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { AdminSidebarSettingsCard } from "@/components/admin/layout/settings/AdminSidebarSettingsCard"
import { QuickLinksSettingsCard } from "@/components/admin/layout/settings/QuickLinksSettingsCard"
import { Card, CardGroup, CardContent } from "@/components/ui/card"
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
  onStatusChange?: (status: { loading: boolean; saving: boolean; message: string | null }) => void
}

export function SiteAdminSettingsTab({ siteId, mode, onStatusChange }: SiteAdminSettingsTabProps) {
  const { sites, currentSite, setCurrentSite } = useSiteSwitcher()
  const contextSite = useMemo(
    () => sites.find((candidate) => candidate.id === siteId) || (currentSite?.id === siteId ? currentSite : null),
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
  const [loading, setLoading] = useState(!contextSite)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  useEffect(() => {
    onStatusChange?.({ loading, saving, message: saveMessage })
  }, [loading, onStatusChange, saveMessage, saving])

  useEffect(() => {
    if (contextSite) {
      setSite(contextSite as Site)
      setQuickLinks(normalizeSiteQuickLinks(contextSite.settings?.quick_links))
      setAdminSidebar(
        resolveAdminSidebarSettings(contextSite.settings?.admin_sidebar, {
          siteId
        })
      )
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

        setSite(result.data)
        setQuickLinks(normalizeSiteQuickLinks(result.data.settings?.quick_links))
        setAdminSidebar(
          resolveAdminSidebarSettings(result.data.settings?.admin_sidebar, {
            siteId
          })
        )
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

  const handleSave = useCallback(async () => {
    if (!site || saving) return

    try {
      setSaving(true)
      setError(null)
      setSaveMessage(null)

      const normalizedQuickLinks = normalizeSiteQuickLinks(quickLinks)
      const nextSettings =
        mode === "sidebar"
          ? {
              ...site.settings,
              admin_sidebar: serializeAdminSidebarSettings(adminSidebar)
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
        return
      }

      if (data) {
        setSite(data)
        if (mode === "sidebar") {
          setAdminSidebar(
            resolveAdminSidebarSettings(data.settings?.admin_sidebar, {
              siteId
            })
          )
        } else {
          setQuickLinks(normalizedQuickLinks)
        }
        if (currentSite?.id === siteId) {
          setCurrentSite({ ...currentSite, ...data })
        }
        setSaveMessage("Settings saved")
        window.setTimeout(() => setSaveMessage(null), 3000)
      }
    } catch (saveError) {
      console.error("Error saving site admin settings:", saveError)
      setError("Failed to save settings")
    } finally {
      setSaving(false)
    }
  }, [adminSidebar, currentSite, mode, quickLinks, saving, setCurrentSite, site, siteId])

  if (loading) {
    return (
      <Card>
        <CardContent className="space-y-4">
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
          <AdminSidebarSettingsCard config={adminSidebar} siteId={siteId} onConfigChange={setAdminSidebar} />
        ) : (
          <QuickLinksSettingsCard quickLinks={quickLinks} onQuickLinksChange={setQuickLinks} />
        )}
      </CardGroup>
    </form>
  )
}
