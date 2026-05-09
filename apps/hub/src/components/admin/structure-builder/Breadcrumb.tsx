"use client"

import { useEffect, useMemo, useState } from "react"
import { CheckCircle } from "lucide-react"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { Button } from "@/components/ui/button"
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
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState("")

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

        const result = await getSiteByIdAction(siteId)

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

  const handleSave = async () => {
    if (!site) return

    try {
      setSaving(true)
      setError(null)
      setSaveMessage("")

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

      const { data, error: updateError } = await updateSiteAction(siteId, {
        settings: nextSettings
      })

      if (updateError) {
        setError(updateError)
        return
      }

      if (data) {
        setSite(data)
        setBreadcrumbs(getBreadcrumbSettings(data.settings))
        if (currentSite?.id === siteId) {
          setCurrentSite({ ...currentSite, ...data })
        }
        setSaveMessage("Breadcrumbs saved")
        window.setTimeout(() => setSaveMessage(""), 3000)
      }
    } catch (saveError) {
      console.error("Error saving breadcrumb settings:", saveError)
      setError("Failed to save breadcrumb settings")
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
                href: `/admin/sites/${siteId}/dashboard`
              },
              { label: "Structure", href: `/admin/sites/${siteId}/pages` },
              { label: "Breadcrumbs" }
            ]}
            actions={
              <div className="flex items-center gap-2">
                {saveMessage && (
                  <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-1.5">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span className="text-sm font-medium text-green-700">{saveMessage}</span>
                  </div>
                )}
                <Button onClick={saving ? undefined : handleSave}>{saving ? "Saving..." : "Save Changes"}</Button>
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
              <CardContent className="space-y-4">
                {BREADCRUMB_OPTIONS.map((option) => (
                  <div key={option.key} className="flex items-center justify-between gap-4">
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
