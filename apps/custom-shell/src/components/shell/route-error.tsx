import { useRouter, type ErrorComponentProps } from "@tanstack/react-router"

import { Card } from "@/components/ui/card"
import { ErrorRow } from "@/components/ui/error-row"

/**
 * What a page shows when its load fails. The router's own default prints raw
 * error text with no explanation and no way back, and the database is remote.
 * The persistent toast raises the failure immediately; the card keeps the same
 * message and retry on the page after that toast is dismissed. The sidebar
 * stays usable.
 *
 * Every admin route builds its error component from this one call, passing the
 * message helper for whatever it loads:
 *
 *   errorComponent: routeErrorComponent(getAdminOverviewErrorMessage)
 *
 * A real-height card matters here: an empty surface is a one-pixel hairline
 * under the header, which looks like a rendering mistake instead of an error.
 */
export function routeErrorComponent(getMessage: (error: unknown) => string) {
  return function RouteError({ error }: ErrorComponentProps) {
    const router = useRouter()

    return (
      <Card size="sm">
        <ErrorRow
          className="min-h-32"
          message={getMessage(error)}
          onRetry={() => void router.invalidate()}
        />
      </Card>
    )
  }
}

/** For a page with nothing of its own to name — the last resort at the root. */
export function getPageErrorMessage(error: unknown) {
  return error instanceof Error && error.message
    ? error.message
    : "This page could not be loaded."
}
