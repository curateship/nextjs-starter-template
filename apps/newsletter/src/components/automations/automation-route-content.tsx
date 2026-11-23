import { getRouteApi, useRouter } from "@tanstack/react-router"

import { AutomationEditor } from "@/components/automations/automation-editor"
import { Button } from "@/components/ui/button"
import { getAutomationErrorMessage } from "@/lib/api/automations"

const routeApi = getRouteApi("/_authenticated/automations/$automationId")

export function AutomationRouteContent() {
  const { automation, favoriteNodeKeys } = routeApi.useLoaderData()

  return (
    // The shell wraps routes in a padded, scrolling main — give the editor a
    // fixed full-height frame inside it so its own panels manage the space.
    <div className="h-full min-h-[60vh] overflow-hidden rounded-xl border border-foreground/5">
      <AutomationEditor
        key={automation.id}
        initial={automation}
        initialFavoriteNodeKeys={favoriteNodeKeys}
      />
    </div>
  )
}

export function AutomationRouteError({ error }: { error: unknown }) {
  const router = useRouter()
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-4 text-center">
      <div>
        <p className="text-sm font-semibold">Could not load this automation</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {getAutomationErrorMessage(error)}
        </p>
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => void router.navigate({ to: "/automations" })}
        >
          Back to Automations
        </Button>
        <Button type="button" onClick={() => void router.invalidate()}>
          Retry
        </Button>
      </div>
    </div>
  )
}
