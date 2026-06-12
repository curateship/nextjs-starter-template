import * as React from "react"
import { Link, useParams } from "@tanstack/react-router"
import { AlertCircleIcon, Loader2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ViralArchiveDashboard } from "@/components/viral-archive-dashboard"
import {
  getCreator,
  getCreatorErrorMessage,
  type CreatorItem,
} from "@/lib/api/creators"

// Fetch outcome tagged with its creator id, so stale results from a previous
// creator are ignored without resetting state inside the effect.
type LoadResult =
  | { creatorId: string; creator: CreatorItem }
  | { creatorId: string; error: string }

// Child level of the Creators drill-down: loads the creator for the
// breadcrumb, then renders the Viral Archive grid scoped to their reels.
export function CreatorDetailPage() {
  const { creatorId } = useParams({
    from: "/_authenticated/admin/creators/$creatorId",
  })
  const [result, setResult] = React.useState<LoadResult | null>(null)

  React.useEffect(() => {
    let active = true

    getCreator(creatorId)
      .then((data) => {
        if (active) setResult({ creatorId, creator: data })
      })
      .catch((loadError) => {
        if (active)
          setResult({ creatorId, error: getCreatorErrorMessage(loadError) })
      })

    return () => {
      active = false
    }
  }, [creatorId])

  const current = result?.creatorId === creatorId ? result : null

  if (current && "error" in current) {
    return (
      <div className="grid h-full place-items-center p-6">
        <div className="text-center">
          <div
            role="alert"
            className="mb-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{current.error}</span>
          </div>
          <Button asChild variant="outline">
            <Link to="/admin/creators">Back to creators</Link>
          </Button>
        </div>
      </div>
    )
  }

  if (!current) {
    return (
      <div className="grid h-full place-items-center">
        <Loader2Icon className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return <ViralArchiveDashboard creator={current.creator} />
}
