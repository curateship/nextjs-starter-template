"use client"

import { useCallback, useEffect, useState } from "react"
import { AdminLayout, AdminCard } from "@/components/admin/layout/admin-layout"
import { ErrorBanner } from "@/components/ui/error-banner"
import { FieldLabel } from "@/components/ui/field-label"
import { AdminLoading } from "@/components/admin/layout/loading"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import LayoutGrid from "lucide-react/dist/esm/icons/layout-grid.js"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { useAutoSave } from "@/components/admin/layout/builder/use-auto-save"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { getAdminSettingsAction, updateAdminSettingsAction } from "@/lib/actions/admin-settings/admin-settings-actions"
import { showErrorToast } from "@/lib/error-toast"
import { setToastSeconds } from "@/lib/toast-duration"
import {
  clampToastSeconds,
  DEFAULT_TOAST_SECONDS,
  MAX_TOAST_SECONDS,
  MIN_TOAST_SECONDS
} from "@/lib/toast-seconds"

/**
 * Seconds a success message stays on screen. Keeps its own draft string so a
 * half-typed or out-of-range value is reported instead of being written to the
 * setting — writing a clamped number back mid-keystroke would rewrite "9" to
 * "60" while the user was still typing "90".
 */
function ToastSecondsField({
  seconds,
  onChange
}: {
  seconds: number
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

interface PlatformSettingsDraft {
  dashboardPageSize: number
  homeRoute: string
  toastSeconds: number
}

export default function PlatformSettingsPage() {
  const { setPageSize: publishPageSize } = useSiteSwitcher()
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [dashboardPageSize, setDashboardPageSize] = useState(50)
  const [homeRoute, setHomeRoute] = useState("")
  const [toastSeconds, setToastSecondsValue] = useState(DEFAULT_TOAST_SECONDS)

  const { saveStatus, scheduleSave, markSaved } = useAutoSave<PlatformSettingsDraft>({
    save: async (draft) => {
      const result = await updateAdminSettingsAction({
        dashboard_page_size: draft.dashboardPageSize,
        home_route: draft.homeRoute.trim(),
        toast_seconds: draft.toastSeconds
      })
      if (result.error) {
        return { saved: false, reason: result.error }
      }

      // The root layout published the old values on page load, so hand the new
      // ones straight to the parts that already hold them rather than making
      // the user reload. Without this, every list keeps its old rows-per-page
      // until a full refresh, while the same number changed from a list footer
      // applies at once — the same setting behaving two different ways.
      setToastSeconds(draft.toastSeconds)
      publishPageSize(draft.dashboardPageSize)
      return { saved: true }
    }
  })

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
      // Loaded values are already what the server holds — never write them back.
      markSaved()
    } catch (error) {
      console.error("Error loading settings:", error)
      setLoadError("Failed to load settings")
    } finally {
      setLoading(false)
    }
  }, [markSaved])

  useEffect(() => {
    void loadSettings()
  }, [loadSettings])

  // One place every edit goes through, so nothing can change a field without
  // queueing the save.
  const applyChange = (patch: Partial<PlatformSettingsDraft>) => {
    const next: PlatformSettingsDraft = {
      dashboardPageSize,
      homeRoute,
      toastSeconds,
      ...patch
    }
    setDashboardPageSize(next.dashboardPageSize)
    setHomeRoute(next.homeRoute)
    setToastSecondsValue(next.toastSeconds)
    scheduleSave(next)
  }

  return (
    <>
      <StickyHeader />
      <AdminLayout>
        <div className="w-full">
          <DashboardSubheader items={[{ label: "Platform Settings" }]} saveStatus={saveStatus} />

          {loadError ? (
            <div className="mb-3 overflow-hidden rounded-lg">
              <ErrorBanner message={loadError} onRetry={() => void loadSettings()} />
            </div>
          ) : null}

          <AdminCard>
            {loading ? (
              <AdminLoading className="min-h-48" />
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
                    onValueChange={(value) => applyChange({ dashboardPageSize: Number(value) })}
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
                    onChange={(event) => applyChange({ homeRoute: event.target.value })}
                  />
                </div>

                <ToastSecondsField
                  seconds={toastSeconds}
                  onChange={(next) => applyChange({ toastSeconds: next })}
                />
              </div>
            )}
          </AdminCard>
        </div>
      </AdminLayout>
    </>
  )
}
