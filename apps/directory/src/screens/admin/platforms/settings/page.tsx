"use client"

import { useCallback, useEffect, useState } from "react"
import { AdminLayout, AdminCard } from "@/components/admin/layout/admin-layout"
import { ErrorBanner } from "@/components/ui/error-banner"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import LayoutGrid from "lucide-react/dist/esm/icons/layout-grid.js"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { getAdminSettingsAction, updateAdminSettingsAction } from "@/lib/actions/admin-settings/admin-settings-actions"
import { dismissErrorToast, showErrorToast } from "@/lib/error-toast"
import { showActionSuccess } from "@/lib/utils/admin-action-feedback"
import { setToastSeconds } from "@/lib/toast-duration"
import {
  clampToastSeconds,
  DEFAULT_TOAST_SECONDS,
  MAX_TOAST_SECONDS,
  MIN_TOAST_SECONDS
} from "@/lib/toast-seconds"

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

/**
 * Seconds a success message stays on screen. Keeps its own draft string so a
 * half-typed or out-of-range value is reported instead of being written to the
 * setting — writing a clamped number back mid-keystroke would rewrite "9" to
 * "60" while the user was still typing "90".
 */
function ToastSecondsField({
  seconds,
  disabled,
  onChange
}: {
  seconds: number
  disabled: boolean
  onChange: (seconds: number) => void
}) {
  const [draft, setDraft] = useState(() => String(seconds))
  const [lastSaved, setLastSaved] = useState(seconds)

  // Follow the saved value when something else changes it (the settings finish
  // loading). Adjusted during render rather than in an effect so the field
  // never paints the stale number first.
  if (lastSaved !== seconds) {
    setLastSaved(seconds)
    setDraft(String(seconds))
  }

  const isValid = (value: string) => {
    const parsed = Number(value)
    return (
      value.trim() !== "" &&
      Number.isInteger(parsed) &&
      parsed >= MIN_TOAST_SECONDS &&
      parsed <= MAX_TOAST_SECONDS
    )
  }

  return (
    <div className="mt-4 grid max-w-xs gap-2">
      <FieldLabel
        htmlFor="platform-toast-seconds"
        hint={`How long a success message stays on screen, from ${MIN_TOAST_SECONDS} to ${MAX_TOAST_SECONDS} seconds. Failures are not affected — they stay until you dismiss them.`}
      >
        Toast message duration (seconds)
      </FieldLabel>
      <Input
        id="platform-toast-seconds"
        type="number"
        inputMode="numeric"
        min={MIN_TOAST_SECONDS}
        max={MAX_TOAST_SECONDS}
        value={draft}
        disabled={disabled}
        aria-invalid={!isValid(draft) || undefined}
        onChange={(event) => {
          const next = event.target.value
          setDraft(next)
          if (isValid(next)) onChange(Number(next))
        }}
        onBlur={() => {
          if (!isValid(draft)) {
            showErrorToast(
              `Enter a whole number of seconds between ${MIN_TOAST_SECONDS} and ${MAX_TOAST_SECONDS}. The last valid value is still in use.`
            )
          }
        }}
      />
    </div>
  )
}

export default function PlatformSettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [dashboardPageSize, setDashboardPageSize] = useState(50)
  const [homeRoute, setHomeRoute] = useState("")
  const [toastSeconds, setToastSecondsValue] = useState(DEFAULT_TOAST_SECONDS)
  const [hasChanges, setHasChanges] = useState(false)

  const loadSettings = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const result = await getAdminSettingsAction()
      if (result.error || !result.data) {
        setLoadError(result.error || "Failed to load settings")
        return
      }

      setDashboardPageSize(result.data.settings.dashboard_page_size || 50)
      setHomeRoute(result.data.settings.home_route || "")
      setToastSecondsValue(clampToastSeconds(result.data.settings.toast_seconds))
    } catch (error) {
      console.error("Error loading settings:", error)
      setLoadError("Failed to load settings")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSettings()
  }, [loadSettings])

  const handleSave = async () => {
    setSaving(true)
    dismissErrorToast()

    try {
      const result = await updateAdminSettingsAction({
        dashboard_page_size: dashboardPageSize,
        home_route: homeRoute.trim(),
        toast_seconds: toastSeconds
      })
      if (result.error) {
        showErrorToast(result.error)
        return
      }

      // The root layout published the old value on page load, so hand the
      // Toaster the new one rather than waiting for a full reload.
      setToastSeconds(toastSeconds)
      showActionSuccess("Settings saved.")
      setHasChanges(false)
    } catch (error) {
      console.error("Error saving settings:", error)
      showErrorToast("Failed to save settings")
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

          {loadError ? (
            <div className="mb-3 overflow-hidden rounded-lg">
              <ErrorBanner message={loadError} onRetry={() => void loadSettings()} />
            </div>
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

                <div className="grid max-w-xs gap-2">
                  <FieldLabel
                    htmlFor="platform-page-size"
                    hint="Applies to all admin dashboard listing pages (posts, products, events, etc.)"
                  >
                    Default dashboard rows per page
                  </FieldLabel>
                  <Select
                    value={String(dashboardPageSize)}
                    onValueChange={(value) => {
                      setDashboardPageSize(Number(value))
                      setHasChanges(true)
                    }}
                    disabled={saving}
                  >
                    <SelectTrigger id="platform-page-size" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="25">25</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="mt-4 grid max-w-xs gap-2">
                  <FieldLabel
                    htmlFor="platform-home-route"
                    hint="Where /admin opens (e.g. /admin/posts). Empty opens the Dashboard. Must be a real route."
                  >
                    Home route
                  </FieldLabel>
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
                </div>

                <ToastSecondsField
                  seconds={toastSeconds}
                  disabled={saving}
                  onChange={(next) => {
                    setToastSecondsValue(next)
                    setHasChanges(true)
                  }}
                />
              </div>
            )}
          </AdminCard>
        </div>
      </AdminLayout>
    </>
  )
}
