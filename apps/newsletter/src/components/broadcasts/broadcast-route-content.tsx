import { getRouteApi, useRouter } from "@tanstack/react-router"

import { BroadcastEditor } from "@/components/broadcasts/broadcast-editor"
import { Button } from "@/components/ui/button"
import { getBroadcastErrorMessage } from "@/lib/api/broadcasts"

const routeApi = getRouteApi("/_authenticated/broadcasts/$broadcastId")

export function BroadcastRouteContent() {
  const broadcast = routeApi.useLoaderData()

  return (
    // The shell wraps routes in a padded, scrolling main — give the editor a
    // fixed full-height frame inside it so its own panels manage the space.
    <div className="h-full min-h-[60vh] overflow-hidden rounded-xl border border-foreground/5">
      <BroadcastEditor key={broadcast.id} initial={broadcast} />
    </div>
  )
}

export function BroadcastRouteError({ error }: { error: unknown }) {
  const router = useRouter()
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-4 text-center">
      <div>
        <p className="text-sm font-semibold">Could not load this broadcast</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {getBroadcastErrorMessage(error)}
        </p>
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => void router.navigate({ to: "/broadcasts" })}
        >
          Back to Broadcasts
        </Button>
        <Button type="button" onClick={() => void router.invalidate()}>
          Retry
        </Button>
      </div>
    </div>
  )
}
