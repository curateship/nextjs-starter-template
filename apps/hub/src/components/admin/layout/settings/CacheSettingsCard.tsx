"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export function CacheSettingsCard() {
  const [clearing, setClearing] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const handleClear = async () => {
    try {
      setClearing(true)
      setMessage(null)
      const res = await fetch("/api/cache/clear", { method: "POST" })
      const data = await res.json()
      if (data.success) {
        setMessage("Cache cleared (app + proxy)")
      } else {
        setMessage(data.error || "Failed to clear cache")
      }
    } catch (e) {
      setMessage("Failed to clear cache")
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
          <p className="text-sm text-muted-foreground">Clear all cached pages (app cache + proxy cache).</p>
          <Button onClick={handleClear} disabled={clearing}>
            {clearing ? "Clearing…" : "Clear Cache"}
          </Button>
        </div>
        {message && <p className="text-sm text-muted-foreground">{message}</p>}
      </CardContent>
    </Card>
  )
}
