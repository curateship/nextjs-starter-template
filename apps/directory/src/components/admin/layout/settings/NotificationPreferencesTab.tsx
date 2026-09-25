"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Loader2 from "lucide-react/dist/esm/icons/loader-circle.js"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ErrorBanner } from "@/components/ui/error-banner"
import { FieldLabel } from "@/components/ui/field-label"
import { Switch } from "@/components/ui/switch"
import { type SaveStatus } from "@/components/admin/layout/builder/save-status"
import { useAutoSave } from "@/components/admin/layout/builder/use-auto-save"
import {
  NOTIFICATION_KINDS,
  type HubNotificationType,
} from "@/lib/actions/notifications/notification-kinds"
import {
  listNotificationPreferences,
  updateNotificationPreference,
  type NotificationPreferenceMap,
} from "@/lib/actions/notifications/notification-preference-actions"

interface NotificationPreferencesTabProps {
  siteId: string
  onStatusChange?: (status: { loading: boolean; saving: boolean; saveStatus: SaveStatus }) => void
}

/**
 * The snapshot auto-save writes: which switches were flipped, on which site.
 * Carrying the site in the snapshot means a toggle made just before switching
 * sites is still written against the site it belonged to.
 */
type PreferenceEdit = {
  siteId: string
  changes: Partial<Record<HubNotificationType, boolean>>
}

export function NotificationPreferencesTab({ siteId, onStatusChange }: NotificationPreferencesTabProps) {
  const [preferences, setPreferences] = useState<NotificationPreferenceMap | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadSignal, setReloadSignal] = useState(0)
  // Switches flipped since the last successful write.
  const pendingEditsRef = useRef<PreferenceEdit["changes"]>({})

  const { saveStatus, isSaving, scheduleSave, markSaved } = useAutoSave<PreferenceEdit>({
    save: async (snapshot) => {
      const entries = Object.entries(snapshot.changes) as Array<[HubNotificationType, boolean]>

      for (const [type, enabled] of entries) {
        try {
          await updateNotificationPreference({ data: { siteId: snapshot.siteId, type, enabled } })
          if (pendingEditsRef.current[type] === enabled) {
            delete pendingEditsRef.current[type]
          }
        } catch (saveError) {
          const reason = saveError instanceof Error
            ? saveError.message
            : "Failed to save notification preference"
          return { saved: false, reason }
        }
      }
      return { saved: true }
    },
  })

  useEffect(() => {
    onStatusChange?.({ loading, saving: isSaving, saveStatus })
  }, [isSaving, loading, onStatusChange, saveStatus])

  useEffect(() => {
    let cancelled = false

    // Edits belong to the site they were made on — switching sites drops any
    // still-debouncing toggle instead of writing it against the new site.
    pendingEditsRef.current = {}
    markSaved()

    const loadPreferences = async () => {
      setLoading(true)
      setError(null)

      try {
        const data = await listNotificationPreferences({ data: { siteId } })
        if (cancelled) return
        setPreferences(data)
      } catch (loadError) {
        if (!cancelled) {
          console.error("Error loading notification preferences:", loadError)
          setError("Failed to load notification preferences")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadPreferences()

    return () => {
      cancelled = true
    }
  }, [markSaved, reloadSignal, siteId])

  const handleToggle = useCallback(
    (type: HubNotificationType, enabled: boolean) => {
      pendingEditsRef.current = { ...pendingEditsRef.current, [type]: enabled }
      setPreferences((current) => (current ? { ...current, [type]: enabled } : current))
      scheduleSave({ siteId, changes: { ...pendingEditsRef.current } })
    },
    [scheduleSave, siteId]
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Notifications</CardTitle>
        <CardDescription>
          Choose which alerts land in your notification tray for this site. These
          switches only affect you — alerts already in the tray stay there.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {error ? (
          <ErrorBanner
            message={error}
            onRetry={() => setReloadSignal((current) => current + 1)}
          />
        ) : loading || !preferences ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          NOTIFICATION_KINDS.map((kind) => (
            <div key={kind.type} className="flex items-center gap-2">
              <Switch
                id={`notification-pref-${kind.type}`}
                checked={preferences[kind.type]}
                onCheckedChange={(checked) => handleToggle(kind.type, checked)}
              />
              <FieldLabel htmlFor={`notification-pref-${kind.type}`} hint={kind.description}>
                {kind.label}
              </FieldLabel>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}
