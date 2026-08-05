import { useRouter, type ErrorComponentProps } from "@tanstack/react-router"

import { ErrorBanner } from "@/components/ui/error-banner"
import { TableSurface } from "@/components/ui/table"

/**
 * What a page shows when its load fails. The router's own default prints raw
 * error text with no explanation and no way back, and the database is remote,
 * so this is the standard strip inside the normal page frame instead — the
 * sidebar stays usable and Try again re-runs the load.
 *
 * Every admin route builds its error component from this one call, passing the
 * message helper for whatever it loads:
 *
 *   errorComponent: routeErrorComponent(getAdminOverviewErrorMessage)
 */
export function routeErrorComponent(getMessage: (error: unknown) => string) {
  return function RouteError({ error }: ErrorComponentProps) {
    const router = useRouter()

    return (
      <TableSurface>
        <ErrorBanner
          message={getMessage(error)}
          onRetry={() => void router.invalidate()}
        />
      </TableSurface>
    )
  }
}

/** For a page with nothing of its own to name — the last resort at the root. */
export function getPageErrorMessage(error: unknown) {
  return error instanceof Error && error.message
    ? error.message
    : "This page could not be loaded."
}
