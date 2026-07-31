"use client"

import { useRef, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { dismissErrorToast, showErrorToast } from "@/lib/error-toast"
import { rebuildSiteSearchIndexAction } from "@/lib/actions/site-search/site-search-actions"

type SearchIndexSettingsCardProps = {
  siteId: string
  /**
   * Mirrors this card's failures into the settings header's save-status badge
   * so the badge and the error toast agree. "idle" clears a failure this card
   * put there once a retry succeeds.
   */
  onSaveStatus?: (state: "error" | "idle", message?: string) => void
}

export function SearchIndexSettingsCard({ siteId, onSaveStatus }: SearchIndexSettingsCardProps) {
  const [rebuilding, setRebuilding] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const reportedErrorRef = useRef(false)

  const reportFailure = (reason: string) => {
    reportedErrorRef.current = true
    setMessage(reason)
    showErrorToast(reason)
    onSaveStatus?.("error", reason)
  }

  const handleRebuild = async () => {
    try {
      setRebuilding(true)
      setMessage(null)
      dismissErrorToast()
      const result = await rebuildSiteSearchIndexAction({ data: { siteId } })
      if (!result.success) {
        reportFailure(result.error || "Rebuild failed. Please try again.")
        return
      }
      if (reportedErrorRef.current) {
        reportedErrorRef.current = false
        onSaveStatus?.("idle")
      }
      setMessage(
        `Search index rebuilt. ${result.indexed} item${result.indexed === 1 ? "" : "s"} can now be found by search.`
      )
    } catch {
      reportFailure("Rebuild failed. Please try again.")
    } finally {
      setRebuilding(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Site Search</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Rebuild the list of pages, posts, listings and events your site&apos;s search box looks
            through. Content is added to it whenever you save it, so you only need this after
            importing content or if search is missing something you know is published.
          </p>
          <Button onClick={handleRebuild} disabled={rebuilding}>
            {rebuilding ? "Rebuilding…" : "Rebuild Search Index"}
          </Button>
        </div>
        {message && <p className="text-sm text-muted-foreground">{message}</p>}
      </CardContent>
    </Card>
  )
}
