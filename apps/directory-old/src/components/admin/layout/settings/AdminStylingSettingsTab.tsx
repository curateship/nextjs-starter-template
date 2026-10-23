"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { AdminStylingSettings } from "@/components/admin/layout/settings/AdminStylingSettings"
import { useAdminStyling } from "@/components/admin/layout/settings/admin-styling-provider"
import { Card, CardContent } from "@/components/ui/card"
import { ErrorBanner } from "@/components/ui/error-banner"
import { type SaveStatus } from "@/components/admin/layout/builder/save-status"
import { useAutoSave } from "@/components/admin/layout/builder/use-auto-save"
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
  const [error, setError] = useState<string | null>(null)

  const { saveStatus, isSaving, scheduleSave } = useAutoSave<AdminStyling>({
    save: async (next) => {
      const result = await updateAdminSettingsAction({ data: { styling: next } })
      if (!result.success) {
        return { saved: false, reason: result.error || "Failed to save styling settings" }
      }

      // The saved value is deliberately not pushed back into the live context:
      // the colours are a live preview, and re-applying a round trip mid-drag
      // makes the whole admin flicker back a step.
      return { saved: true }
    }
  })

  useEffect(() => {
    onStatusChange?.({ loading, saving: isSaving, saveStatus })
  }, [isSaving, loading, onStatusChange, saveStatus])

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
      scheduleSave(next)
    },
    [scheduleSave, stylingContext]
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

  return (
    <>
      {error ? (
        <div className="mb-3 overflow-hidden rounded-lg">
          <ErrorBanner message={error} />
        </div>
      ) : null}
      <AdminStylingSettings styling={styling} isSaving={isSaving} onChange={handleChange} />
    </>
  )
}
