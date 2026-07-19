"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { AdminStylingSettings } from "@/components/admin/layout/settings/AdminStylingSettings"
import { Card, CardContent } from "@/components/ui/card"
import { useSaveStatus, type SaveStatus } from "@/components/admin/layout/builder/save-status"
import {
  getAdminSettingsAction,
  updateAdminSettingsAction,
} from "@/lib/actions/admin-settings/admin-settings-actions"
import {
  createDefaultStyling,
  normalizeStyling,
  type ShellStyling,
} from "@/lib/admin-styling"

interface AdminStylingTabProps {
  onStatusChange?: (status: { loading: boolean; saving: boolean; saveStatus: SaveStatus }) => void
}

export function AdminStylingTab({ onStatusChange }: AdminStylingTabProps) {
  const router = useRouter()
  const [styling, setStyling] = useState<ShellStyling>(() => createDefaultStyling())
  const stylingRef = useRef(styling)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useSaveStatus()

  useEffect(() => {
    onStatusChange?.({ loading, saving, saveStatus })
  }, [loading, onStatusChange, saveStatus, saving])

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        setLoading(true)
        setError(null)
        const result = await getAdminSettingsAction()
        if (cancelled) return

        if (!result.success || !result.data) {
          setError(result.error || "Failed to load appearance settings")
          return
        }

        const next = normalizeStyling(result.data.settings?.styling)
        stylingRef.current = next
        setStyling(next)
      } catch (loadError) {
        if (!cancelled) {
          console.error("Error loading admin styling settings:", loadError)
          setError("Failed to load appearance settings")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [])

  const handleStylingChange = useCallback((next: ShellStyling) => {
    stylingRef.current = next
    setStyling(next)
  }, [])

  const handleSave = useCallback(async () => {
    if (saving) return false

    try {
      setSaving(true)
      setError(null)
      setSaveStatus("saving")

      const normalized = normalizeStyling(stylingRef.current)
      const result = await updateAdminSettingsAction({ styling: normalized })

      if (!result.success) {
        const message = result.error || "Failed to save appearance settings"
        setError(message)
        setSaveStatus("error", message)
        return false
      }

      const saved = normalizeStyling(result.data?.settings?.styling ?? normalized)
      stylingRef.current = saved
      setStyling(saved)
      setSaveStatus("saved", "Appearance saved")
      // Re-run the admin server layout so the live shell picks up the new styling.
      router.refresh()
      return true
    } catch (saveError) {
      console.error("Error saving admin styling settings:", saveError)
      setError("Failed to save appearance settings")
      setSaveStatus("error", "Failed to save appearance settings")
      return false
    } finally {
      setSaving(false)
    }
  }, [router, saving, setSaveStatus])

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

  return (
    <form
      id="site-admin-settings-form"
      className="contents"
      onSubmit={(event) => {
        event.preventDefault()
        handleSave()
      }}
    >
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}
      <AdminStylingSettings
        styling={styling}
        isSaving={saving}
        onStylingChange={handleStylingChange}
      />
    </form>
  )
}
