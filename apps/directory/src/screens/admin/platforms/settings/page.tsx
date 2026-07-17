"use client"

import { useEffect, useState } from "react"
import { AdminLayout, AdminCard } from "@/components/admin/layout/admin-layout"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import AlertTriangle from "lucide-react/dist/esm/icons/triangle-alert.js"
import LayoutGrid from "lucide-react/dist/esm/icons/layout-grid.js"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { getAdminSettingsAction, updateAdminSettingsAction } from "@/lib/actions/admin-settings/admin-settings-actions"

function PlatformSettingsSkeleton() {
  return (
    <div className="space-y-6 p-6" aria-label="Loading platform settings">
      <div className="flex items-center gap-3">
        <Skeleton className="size-5 rounded-full" />
        <Skeleton className="h-6 w-40" />
      </div>
      <Skeleton className="h-4 w-80 max-w-full" />
      <div className="max-w-xs space-y-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-3 w-72 max-w-full" />
      </div>
    </div>
  )
}

export default function PlatformSettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [dashboardPageSize, setDashboardPageSize] = useState(50)
  const [homeRoute, setHomeRoute] = useState("")
  const [hasChanges, setHasChanges] = useState(false)

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const result = await getAdminSettingsAction()
        if (result.error || !result.data) {
          setMessage({ type: "error", text: result.error || "Failed to load settings" })
          return
        }

        setDashboardPageSize(result.data.settings.dashboard_page_size || 50)
        setHomeRoute(result.data.settings.home_route || "")
      } catch (error) {
        console.error("Error loading settings:", error)
        setMessage({ type: "error", text: "Failed to load settings" })
      } finally {
        setLoading(false)
      }
    }

    void loadSettings()
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setMessage(null)

    try {
      const result = await updateAdminSettingsAction({
        dashboard_page_size: dashboardPageSize,
        home_route: homeRoute.trim()
      })
      if (result.error) {
        setMessage({ type: "error", text: result.error })
        return
      }

      setMessage({ type: "success", text: "Settings saved successfully" })
      setHasChanges(false)
    } catch (error) {
      console.error("Error saving settings:", error)
      setMessage({ type: "error", text: "Failed to save settings" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <StickyHeader />
      <AdminLayout>
        <div className="w-full">
          <DashboardSubheader
            items={[{ label: "Platform Settings" }]}
            isSaving={saving}
            onSave={handleSave}
            saveDisabled={loading || !hasChanges}
            saveLabel="Save"
            savingLabel="Saving..."
            saveVariant="default"
          />

          {message ? (
            <Alert className={`mb-6 ${message.type === "error" ? "border-red-200 bg-red-50" : "border-green-200 bg-green-50"}`}>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className={message.type === "error" ? "text-red-800" : "text-green-800"}>
                {message.text}
              </AlertDescription>
            </Alert>
          ) : null}

          <AdminCard>
            {loading ? (
              <PlatformSettingsSkeleton />
            ) : (
              <div className="p-6">
                <div className="mb-6 flex items-center gap-3">
                  <LayoutGrid className="h-5 w-5 text-primary" />
                  <h3 className="text-lg font-semibold">General Settings</h3>
                </div>

                <p className="mb-6 text-sm text-muted-foreground">
                  Configure dashboard defaults for the admin panel.
                </p>

                <div className="max-w-xs">
                  <label className="mb-2 block text-sm font-medium">Default dashboard rows per page</label>
                  <Select
                    value={String(dashboardPageSize)}
                    onValueChange={(value) => {
                      setDashboardPageSize(Number(value))
                      setHasChanges(true)
                    }}
                    disabled={saving}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="25">25</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Applies to all admin dashboard listing pages (posts, products, events, etc.)
                  </p>
                </div>

                <div className="mt-6 max-w-xs">
                  <label htmlFor="platform-home-route" className="mb-2 block text-sm font-medium">
                    Home route
                  </label>
                  <Input
                    id="platform-home-route"
                    value={homeRoute}
                    placeholder="Leave empty for Dashboard"
                    disabled={saving}
                    onChange={(event) => {
                      setHomeRoute(event.target.value)
                      setHasChanges(true)
                    }}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Where /admin opens (e.g. /admin/posts). Empty opens the Dashboard. Must be a real route.
                  </p>
                </div>
              </div>
            )}
          </AdminCard>
        </div>
      </AdminLayout>
    </>
  )
}
