"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { rebuildSiteSearchIndexAction } from "@/lib/actions/site-search/site-search-actions"

export function SearchIndexSettingsCard({ siteId }: { siteId: string }) {
  const [rebuilding, setRebuilding] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const handleRebuild = async () => {
    try {
      setRebuilding(true)
      setMessage(null)
      const result = await rebuildSiteSearchIndexAction({ data: { siteId } })
      setMessage(
        result.success
          ? `Search index rebuilt. ${result.indexed} item${result.indexed === 1 ? "" : "s"} can now be found by search.`
          : result.error || "Rebuild failed. Please try again."
      )
    } catch {
      setMessage("Rebuild failed. Please try again.")
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
