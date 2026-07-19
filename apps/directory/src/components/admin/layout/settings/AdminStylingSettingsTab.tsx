"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { AdminStylingSettings } from "@/components/admin/layout/settings/AdminStylingSettings"
import { useAdminStyling } from "@/components/admin/layout/settings/admin-styling-provider"
import { Card, CardContent } from "@/components/ui/card"
import { useSaveStatus, type SaveStatus } from "@/components/admin/layout/builder/save-status"
import {
  getAdminSettingsAction,
  updateAdminSettingsAction,
} from "@/lib/actions/admin-settings/admin-settings-actions"
import { createDefaultStyling, normalizeStyling, type AdminStyling } from "@/lib/utils/admin-styling"

interface AdminStylingSettingsTabProps {
  onStatusChange?: (status: { loading: boolean; saving: boolean; saveStatus: SaveStatus }) => void
}

export function AdminStylingSettingsTab({ onStatusChange }: AdminStylingSettingsTabProps) {
  const stylingContext = useAdminStyling()
  const styling = stylingContext?.styling ?? createDefaultStyling()
  const stylingRef = useRef<AdminStyling>(styling)
  stylingRef.current = styling

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useSaveStatus()

  useEffect(() => {
    onStatusChange?.({ loading, saving, saveStatus })
  }, [loading, onStatusChange, saveStatus, saving])

  // Sync the live context with the persisted value on mount (the shell may have
  // been initialized before the latest save).
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        setLoading(true)
        setError(null)
        const result = await getAdminSettingsAction()
        if (cancelled) return
        if (!result.success || !result.data) {
          setError(result.error || "Failed to load styling settings")
          return
        }
        stylingContext?.setStyling(normalizeStyling(result.data.settings?.styling))
      } catch (loadError) {
        if (!cancelled) {
          console.error("Error loading admin styling settings:", loadError)
          setError("Failed to load styling settings")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleChange = useCallback(
    (next: AdminStyling) => {
      stylingRef.current = next
      stylingContext?.setStyling(next)
    },
    [stylingContext]
  )

  const handleSave = useCallback(async () => {
    if (saving) return false
    try {
      setSaving(true)
      setError(null)
      setSaveStatus("saving")

      const result = await updateAdminSettingsAction({ styling: stylingRef.current })
      if (!result.success) {
        setError(result.error || "Failed to save styling settings")
        setSaveStatus("error", result.error || "Failed to save styling settings")
        return false
      }

      const saved = normalizeStyling(result.data?.settings?.styling)
      stylingContext?.setStyling(saved)
      setSaveStatus("saved", "Styling saved")
      return true
    } catch (saveError) {
      console.error("Error saving admin styling settings:", saveError)
      setError("Failed to save styling settings")
      setSaveStatus("error", "Failed to save styling settings")
      return false
    } finally {
      setSaving(false)
    }
  }, [saving, setSaveStatus, stylingContext])

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
      id="admin-styling-settings-form"
      className="contents"
      onSubmit={(event) => {
        event.preventDefault()
        void handleSave()
      }}
    >
      {error && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}
      <AdminStylingSettings styling={styling} isSaving={saving} onChange={handleChange} />
    </form>
  )
}
