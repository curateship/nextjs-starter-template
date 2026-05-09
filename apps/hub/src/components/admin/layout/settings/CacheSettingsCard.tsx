"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const TTL_OPTIONS = [
  { label: "Never (permanent)", value: "31536000" },
  { label: "1 hour", value: "3600" },
  { label: "6 hours", value: "21600" },
  { label: "24 hours", value: "86400" },
  { label: "7 days", value: "604800" }
]

export function CacheSettingsCard() {
  const [clearing, setClearing] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [ttl, setTtl] = useState(process.env.NEXT_PUBLIC_CACHE_TTL_SECONDS || "31536000")
  const [savingTtl, setSavingTtl] = useState(false)

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

  const handleTtlChange = async (value: string) => {
    setTtl(value)
    setSavingTtl(true)
    setMessage(null)
    try {
      const res = await fetch("/api/cache/ttl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ttl: value })
      })
      const data = await res.json()
      if (data.success) {
        const label = TTL_OPTIONS.find((o) => o.value === value)?.label || value
        setMessage(`Auto-refresh set to ${label}. Takes effect on next deploy.`)
      } else {
        setMessage(data.error || "Failed to update TTL")
      }
    } catch (e) {
      setMessage("Failed to update TTL")
    } finally {
      setSavingTtl(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cache</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Clear all cached pages (app cache + proxy cache).</p>
          <Button onClick={handleClear} disabled={clearing}>
            {clearing ? "Clearing…" : "Clear Cache"}
          </Button>
        </div>
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Auto-refresh interval — how long cached pages are served before automatically refreshing.
          </p>
          <Select value={ttl} onValueChange={handleTtlChange} disabled={savingTtl}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TTL_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {message && <p className="text-sm text-muted-foreground">{message}</p>}
      </CardContent>
    </Card>
  )
}
