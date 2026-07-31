import { createFileRoute, redirect } from "@tanstack/react-router"

import { AuthShell } from "@/components/shell/auth-shell"
import { Button } from "@/components/ui/button"
import { loadMaintenance } from "@/lib/api/maintenance"
import { resolveMaintenanceMessage } from "@/lib/custom-shell"

/**
 * Where everyone but an admin lands while maintenance mode is on. It is a
 * public route on purpose: signing in still works so an admin can get in, and a
 * member who signs in is sent straight back here.
 */
export const Route = createFileRoute("/maintenance")({
  loader: async () => {
    const maintenance = await loadMaintenance()
    // Nothing to say once the app is open again — send them to it. The check
    // runs on the server every time this page loads, so switching maintenance
    // off can never leave somebody stuck here.
    if (!maintenance.enabled) {
      throw redirect({ to: "/" })
    }

    return { message: resolveMaintenanceMessage(maintenance.message) }
  },
  component: MaintenanceRoute,
})

function MaintenanceRoute() {
  const { message } = Route.useLoaderData()

  return (
    <AuthShell title="We will be back soon">
      <p className="text-sm text-muted-foreground">{message}</p>
      <Button
        type="button"
        variant="outline"
        className="w-full"
        // A full load, not a client-side navigation: it asks the server again
        // instead of trusting anything this tab already had.
        onClick={() => window.location.assign("/")}
      >
        Try again
      </Button>
    </AuthShell>
  )
}
