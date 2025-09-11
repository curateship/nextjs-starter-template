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
      const res = await fetch('/api/cache/clear', { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        setMessage('Cache cleared')
      } else {
        setMessage(data.error || 'Failed to clear cache')
      }
    } catch (e) {
      setMessage('Failed to clear cache')
    } finally {
      setClearing(false)
    }
  }

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>Cache</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">Clear in-memory route cache for site and page lookups.</p>
        <div className="flex items-center gap-3">
          <Button onClick={handleClear} disabled={clearing}>{clearing ? 'Clearing…' : 'Clear Cache'}</Button>
          {message && <span className="text-sm">{message}</span>}
        </div>
      </CardContent>
    </Card>
  )
}


