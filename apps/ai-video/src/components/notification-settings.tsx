import * as React from "react"
import { Loader2Icon } from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardGroup,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  getNotificationPreferenceErrorMessage,
  loadNotificationPreferences,
  saveNotificationPreferences,
  type NotificationPreferenceMap,
} from "@/lib/api/notification-preferences"
import { NOTIFICATION_PREFERENCE_TYPES } from "@/lib/notification-preferences"

// `saveRef` lets the Settings page's top "Save" button save this tab — the
// component publishes its save function there instead of owning a button, the
// same way the AI Providers tab does.
export function NotificationSettings({
  saveRef,
}: {
  saveRef: React.RefObject<(() => Promise<void>) | null>
}) {
  const [preferences, setPreferences] =
    React.useState<NotificationPreferenceMap | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [loadFailed, setLoadFailed] = React.useState(false)

  React.useEffect(() => {
    let active = true
    loadNotificationPreferences()
      .then((result) => {
        if (!active) return
        setPreferences(result)
        setLoadFailed(false)
      })
      .catch((loadError) => {
        if (!active) return
        setError(getNotificationPreferenceErrorMessage(loadError))
        setLoadFailed(true)
      })
    return () => {
      active = false
    }
  }, [])

  async function savePreferences() {
    if (!preferences) return
    setError(null)
    try {
      const saved = await saveNotificationPreferences(preferences)
      setPreferences(saved)
      setLoadFailed(false)
    } catch (saveError) {
      setError(getNotificationPreferenceErrorMessage(saveError))
    }
  }

  // Publish the save function each render so it closes over the latest toggles.
  React.useEffect(() => {
    saveRef.current = savePreferences
    return () => {
      saveRef.current = null
    }
  })

  return (
    <CardGroup>
      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>
            Choose which events ring the bell. Turning one off stops new
            notifications of that kind — it never removes ones you already have.
            Click Save above to apply.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          {preferences == null && !loadFailed ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" />
              Loading…
            </div>
          ) : loadFailed ? (
            <p className="text-sm text-muted-foreground">
              Notification settings are unavailable right now. Try again later.
            </p>
          ) : (
            NOTIFICATION_PREFERENCE_TYPES.map((entry) => {
              const inputId = `notify-${entry.type}`
              const checked = preferences?.[entry.type] ?? true
              return (
                <div key={entry.type} className="flex items-start gap-4">
                  <div className="grid flex-1 gap-1">
                    <Label htmlFor={inputId} className="font-medium">
                      {entry.label}
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      {entry.description}
                    </p>
                    {entry.note ? (
                      <p className="text-xs text-muted-foreground">
                        {entry.note}
                      </p>
                    ) : null}
                  </div>
                  <Switch
                    id={inputId}
                    checked={checked}
                    onCheckedChange={(value) =>
                      setPreferences((prev) =>
                        prev ? { ...prev, [entry.type]: value } : prev
                      )
                    }
                  />
                </div>
              )
            })
          )}
        </CardContent>
      </Card>
    </CardGroup>
  )
}
