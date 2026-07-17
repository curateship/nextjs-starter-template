"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AdminSidebarSettingsCard } from "@/components/admin/layout/settings/AdminSidebarSettingsCard"
import { Card, CardGroup, CardContent } from "@/components/ui/card"
import { useSaveStatus, type SaveStatus } from "@/components/admin/layout/builder/save-status"
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
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useSaveStatus()

  useEffect(() => {
    onStatusChange?.({ loading, saving, saveStatus })
  }, [loading, onStatusChange, saveStatus, saving])

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

  const handleSave = useCallback(async () => {
    if (!site || saving) return false

    try {
      setSaving(true)
      setError(null)
      setSaveStatus("saving")

      const nextSettings = {
        ...site.settings,
        admin_sidebar: serializeAdminSidebarSettings(adminSidebarRef.current)
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
        const nextAdminSidebar = resolveAdminSidebarSettings(data.settings?.admin_sidebar, {
          siteId
        })
        adminSidebarRef.current = nextAdminSidebar
        setAdminSidebar(nextAdminSidebar)
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
  }, [contextSite, currentSite, saving, setCurrentSite, setSaveStatus, site, siteId])

  const handleAdminSidebarChange = useCallback(
    (nextSidebar: AdminSidebarSettings) => {
      adminSidebarRef.current = nextSidebar
      setAdminSidebar(nextSidebar)

      const nextAdminSidebar = serializeAdminSidebarSettings(nextSidebar)
      updateCachedSiteSettings({ admin_sidebar: nextAdminSidebar })
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
        <AdminSidebarSettingsCard
          config={adminSidebar}
          siteId={siteId}
          onConfigChange={handleAdminSidebarChange}
          onSave={handleSave}
        />
      </CardGroup>
    </form>
  )
}
