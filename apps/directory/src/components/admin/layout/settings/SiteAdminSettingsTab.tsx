"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AdminSidebarSettingsCard } from "@/components/admin/layout/settings/AdminSidebarSettingsCard"
import { Card, CardGroup, CardContent } from "@/components/ui/card"
import { ErrorBanner } from "@/components/ui/error-banner"
import { type SaveStatus } from "@/components/admin/layout/builder/save-status"
import { useAutoSave } from "@/components/admin/layout/builder/use-auto-save"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { getSiteByIdAction, updateSiteAction, type Site } from "@/lib/actions/sites/site-actions"
import {
  resolveAdminSidebarSettings,
  serializeAdminSidebarSettings,
  type AdminSidebarSettings
} from "@/lib/utils/admin-sidebar"

interface SiteAdminSettingsTabProps {
  siteId: string
  onStatusChange?: (status: { loading: boolean; saving: boolean; saveStatus: SaveStatus }) => void
}

export function SiteAdminSettingsTab({ siteId, onStatusChange }: SiteAdminSettingsTabProps) {
  const { sites, currentSite, setCurrentSite } = useSiteSwitcher()
  const contextSite = useMemo(
    () => (currentSite?.id === siteId ? currentSite : sites.find((candidate) => candidate.id === siteId) || null),
    [currentSite, siteId, sites]
  )

  const [site, setSite] = useState<Site | null>(contextSite as Site | null)
  const [adminSidebar, setAdminSidebar] = useState<AdminSidebarSettings>(
    resolveAdminSidebarSettings(contextSite?.settings?.admin_sidebar, {
      siteId
    })
  )
  const adminSidebarRef = useRef(adminSidebar)
  const [loading, setLoading] = useState(!contextSite)
  const [error, setError] = useState<string | null>(null)
  const siteRef = useRef<Site | null>(site)
  siteRef.current = site

  const { saveStatus, isSaving, scheduleSave, saveNow } = useAutoSave<AdminSidebarSettings>({
    save: async (nextSidebar) => {
      const currentSite = siteRef.current
      if (!currentSite) return { saved: false, reason: "Site not loaded" }

      const { data, error: updateError } = await updateSiteAction(siteId, {
        settings: {
          ...currentSite.settings,
          admin_sidebar: serializeAdminSidebarSettings(nextSidebar)
        }
      })

      if (updateError) return { saved: false, reason: updateError }
      if (!data) return { saved: false, reason: "Failed to save settings" }

      // The switcher already holds this edit — handleAdminSidebarChange puts it
      // there as you type — so only the rest of the site's settings are
      // refreshed here. Writing the round trip back would undo anything typed
      // while it was in flight.
      setSite(data)
      return { saved: true }
    }
  })

  useEffect(() => {
    onStatusChange?.({ loading, saving: isSaving, saveStatus })
  }, [isSaving, loading, onStatusChange, saveStatus])

  useEffect(() => {
    if (contextSite) {
      const nextAdminSidebar = resolveAdminSidebarSettings(contextSite.settings?.admin_sidebar, {
        siteId
      })

      setSite(contextSite as Site)
      adminSidebarRef.current = nextAdminSidebar
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

        const nextAdminSidebar = resolveAdminSidebarSettings(result.data.settings?.admin_sidebar, {
          siteId
        })

        setSite(result.data)
        adminSidebarRef.current = nextAdminSidebar
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

  // The link editor's "Done" writes straight away rather than leaving the last
  // edit sitting in the debounce after the dialog has closed.
  const handleSave = useCallback(async () => saveNow(adminSidebarRef.current), [saveNow])

  const handleAdminSidebarChange = useCallback(
    (nextSidebar: AdminSidebarSettings) => {
      adminSidebarRef.current = nextSidebar
      setAdminSidebar(nextSidebar)

      const nextAdminSidebar = serializeAdminSidebarSettings(nextSidebar)
      updateCachedSiteSettings({ admin_sidebar: nextAdminSidebar })
      scheduleSave(nextSidebar)
    },
    [scheduleSave, updateCachedSiteSettings]
  )

  if (loading) {
    return (
      <Card>
        <CardContent>
          {[1, 2, 3].map((item) => (
            <div key={item} className="space-y-2">
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
    <CardGroup className="grid">
      {error ? <ErrorBanner message={error} /> : null}
      <AdminSidebarSettingsCard
        config={adminSidebar}
        siteId={siteId}
        onConfigChange={handleAdminSidebarChange}
        onSave={handleSave}
      />
    </CardGroup>
  )
}
