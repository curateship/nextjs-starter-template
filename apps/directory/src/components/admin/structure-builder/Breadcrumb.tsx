"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { useSaveStatus } from "@/components/admin/layout/builder/save-status"
import { AUTO_SAVE_DEBOUNCE_MS } from "@/components/admin/layout/builder/use-auto-save"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { getSiteByIdAction, updateSiteAction, type Site } from "@/lib/actions/sites/site-actions"

const BREADCRUMB_OPTIONS = [
  {
    key: "posts",
    label: "Posts",
    description: "Show the primary category path on post pages."
  },
  {
    key: "products",
    label: "Products",
    description: "Show the primary category path on product pages."
  },
  {
    key: "directories",
    label: "Directory",
    description: "Show the primary category path on directory item pages."
  },
  {
    key: "events",
    label: "Events",
    description: "Show the primary category path on event pages."
  },
  {
    key: "categories",
    label: "Categories",
    description: "Show the parent category path on category pages."
  }
] as const

type BreadcrumbKey = (typeof BREADCRUMB_OPTIONS)[number]["key"]
type BreadcrumbSettings = Record<BreadcrumbKey, boolean>

function getBreadcrumbSettings(settings: Record<string, any> | undefined): BreadcrumbSettings {
  const breadcrumbs = settings?.breadcrumbs as Record<string, boolean> | undefined

  return BREADCRUMB_OPTIONS.reduce((result, option) => {
    result[option.key] = breadcrumbs?.[option.key] !== false
    return result
  }, {} as BreadcrumbSettings)
}

interface BreadcrumbProps {
  siteId: string
}

export function Breadcrumb({ siteId }: BreadcrumbProps) {
  const { sites, currentSite, setCurrentSite } = useSiteSwitcher()
  const contextSite = useMemo(
    () => sites.find((candidate) => candidate.id === siteId) || (currentSite?.id === siteId ? currentSite : null),
    [currentSite, siteId, sites]
  )

  const [site, setSite] = useState<Site | null>(contextSite as Site | null)
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbSettings>(getBreadcrumbSettings(contextSite?.settings))
  const [loading, setLoading] = useState(!contextSite)
  const [error, setError] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useSaveStatus()

  useEffect(() => {
    if (contextSite) {
      setSite(contextSite as Site)
      setBreadcrumbs(getBreadcrumbSettings(contextSite.settings))
      setLoading(false)
      return
    }

    let cancelled = false

    async function loadSite() {
      try {
        setLoading(true)
        setError(null)

        const result = await getSiteByIdAction({ data: { siteId } })

        if (cancelled) return

        if (result.error || !result.data) {
          setError(result.error || "Site not found")
          return
        }

        setSite(result.data)
        setBreadcrumbs(getBreadcrumbSettings(result.data.settings))
      } catch (loadError) {
        if (!cancelled) {
          console.error("Error loading breadcrumb settings:", loadError)
          setError("Failed to load breadcrumb settings")
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

  // Auto-save bookkeeping — declared above handleSave because it records what
  // that save wrote.
  const lastBreadcrumbsJsonRef = useRef<string | null>(null)
  const pendingBreadcrumbSaveRef = useRef(false)

  const handleSave = async () => {
    if (!site) return

    try {
      setError(null)
      setSaveStatus("saving")

      const currentBreadcrumbs = {
        ...((site.settings?.breadcrumbs as Record<string, boolean> | undefined) || {})
      }
      const nextSettings = {
        ...site.settings,
        breadcrumbs: {
          ...currentBreadcrumbs,
          ...breadcrumbs
        }
      }

      const { data, error: updateError } = await updateSiteAction({ data: { siteId, updates: {
        settings: nextSettings
      } } })

      if (updateError) {
        setError(updateError)
        setSaveStatus("error", updateError)
        return
      }

      if (data) {
        const savedBreadcrumbs = getBreadcrumbSettings(data.settings)
        lastBreadcrumbsJsonRef.current = JSON.stringify(savedBreadcrumbs)
        setSite(data)
        setBreadcrumbs(savedBreadcrumbs)
        if (currentSite?.id === siteId) {
          setCurrentSite({ ...currentSite, ...data })
        }
        setSaveStatus("saved", "Breadcrumbs saved")
      }
    } catch (saveError) {
      console.error("Error saving breadcrumb settings:", saveError)
      setError("Failed to save breadcrumb settings")
      setSaveStatus("error", "Failed to save breadcrumb settings")
    }
  }

  // Auto-save: a switch flipped here is written a moment later.
  const handleSaveRef = useRef(handleSave)
  handleSaveRef.current = handleSave
  const watchedBreadcrumbsJson = JSON.stringify(breadcrumbs)

  useEffect(() => {
    if (loading || !site) {
      lastBreadcrumbsJsonRef.current = null
      return
    }
    if (lastBreadcrumbsJsonRef.current === null) {
      lastBreadcrumbsJsonRef.current = watchedBreadcrumbsJson
      return
    }
    if (lastBreadcrumbsJsonRef.current === watchedBreadcrumbsJson) return

    lastBreadcrumbsJsonRef.current = watchedBreadcrumbsJson
    pendingBreadcrumbSaveRef.current = true
    const timer = setTimeout(() => {
      pendingBreadcrumbSaveRef.current = false
      void handleSaveRef.current()
    }, AUTO_SAVE_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [loading, site, watchedBreadcrumbsJson])

  // Leaving the screen inside that wait must not lose the edit.
  useEffect(() => {
    return () => {
      if (pendingBreadcrumbSaveRef.current) {
        void handleSaveRef.current()
      }
    }
  }, [])

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
              { label: "Breadcrumbs" }
            ]}
            saveStatus={saveStatus}
          />

          {error && (
            <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 p-4">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {loading ? (
            <Card>
              <CardContent className="space-y-4">
                {BREADCRUMB_OPTIONS.map((option) => (
                  <div key={option.key} className="flex items-center justify-between gap-4">
                    <div className="space-y-2">
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : !site ? (
            <Card>
              <CardContent>
                <p className="text-sm text-muted-foreground">Unable to load structure settings for this site.</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Breadcrumbs</CardTitle>
                <CardDescription>Choose where frontend breadcrumb paths appear.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {BREADCRUMB_OPTIONS.map((option) => (
                  <div key={option.key} className="flex items-center justify-between gap-4">
                    <div className="space-y-1">
                      <Label htmlFor={`breadcrumbs-${option.key}`} className="font-medium">
                        {option.label}
                      </Label>
                      <p className="text-xs text-muted-foreground">{option.description}</p>
                    </div>
                    <Switch
                      id={`breadcrumbs-${option.key}`}
                      checked={breadcrumbs[option.key]}
                      onCheckedChange={(checked) => {
                        setBreadcrumbs((current) => ({
                          ...current,
                          [option.key]: checked
                        }))
                      }}
                    />
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </AdminLayout>
    </>
  )
}
