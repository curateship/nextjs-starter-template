import { useRouter, type ErrorComponentProps } from "@tanstack/react-router"

import {
  AuthShell,
  authLinkClassName,
} from "@/components/shell/auth-shell"
import { Button } from "@/components/ui/button"
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

/**
 * A failed public loader stays inside the signed-out frame. The address does
 * not change, Try again repeats that page's loader, and sign in is a useful
 * way out for a visitor even when the page keeps failing.
 */
export function visitorRouteErrorComponent(
  getMessage: (error: unknown) => string = getVisitorPageErrorMessage
) {
  return function VisitorRouteError({ error }: ErrorComponentProps) {
    const router = useRouter()

    return (
      <AuthShell
        title="This page could not be loaded"
        description={getMessage(error)}
        footer={
          <p>
            <a href="/login" className={authLinkClassName}>
              Open sign in
            </a>
          </p>
        }
      >
        <Button
          type="button"
          className="w-full"
          onClick={() => void router.invalidate()}
        >
          Try again
        </Button>
      </AuthShell>
    )
  }
}

/** Public pages never print an unexpected server error to a signed-out user. */
export function getVisitorPageErrorMessage(_error: unknown) {
  return "The page did not finish loading. Please try again."
}

/** For a page with nothing of its own to name — the last resort at the root. */
export function getPageErrorMessage(error: unknown) {
  return error instanceof Error && error.message
    ? error.message
    : "This page could not be loaded."
}
