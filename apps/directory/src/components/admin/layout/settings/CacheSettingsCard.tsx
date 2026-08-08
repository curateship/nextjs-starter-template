"use client"

import { useRef, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { dismissErrorToast, showErrorToast } from "@/lib/error-toast"

type CacheSettingsCardProps = {
  /**
   * Mirrors this card's failures into the settings header's save-status badge
   * so the badge and the error toast agree. "idle" clears a failure this card
   * put there once a retry succeeds.
   */
  onSaveStatus?: (state: "error" | "idle", message?: string) => void
}

export function CacheSettingsCard({ onSaveStatus }: CacheSettingsCardProps) {
  const [clearing, setClearing] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const reportedErrorRef = useRef(false)

  const reportFailure = (reason: string) => {
    reportedErrorRef.current = true
    setMessage(reason)
    showErrorToast(reason)
    onSaveStatus?.("error", reason)
  }

  const handleClear = async () => {
    try {
      setClearing(true)
      setMessage(null)
      dismissErrorToast()
      const res = await fetch("/api/cache/clear", { method: "POST" })
      const data = await res.json()
      if (data.success) {
        if (reportedErrorRef.current) {
          reportedErrorRef.current = false
          onSaveStatus?.("idle")
        }
        setMessage(
          data.proxyPurged
            ? "Cache cleared (app + proxy)"
            : "App cache cleared. No proxy/CDN purge is configured, so cached pages at the CDN were left alone."
        )
      } else {
        reportFailure(data.error || "Failed to clear cache")
      }
    } catch {
      reportFailure("Failed to clear cache")
    } finally {
      setClearing(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cache</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Clear all cached pages (app cache + proxy cache). The app cache also clears itself whenever you save content.</p>
          <Button onClick={handleClear} disabled={clearing}>
            {clearing ? "Clearing…" : "Clear Cache"}
          </Button>
        </div>
        {message && <p className="text-sm text-muted-foreground">{message}</p>}
      </CardContent>
    </Card>
  )
}
