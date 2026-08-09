import { useRouter, type ErrorComponentProps } from "@tanstack/react-router"

import { ErrorBanner } from "@/components/ui/error-banner"

/**
 * What a page shows when its load fails. The router's own default prints raw
 * error text with no explanation and no way back, and the database is remote,
 * so the failure is raised the way every other one is — the persistent toast,
 * carrying Try again, which re-runs the load. The sidebar stays usable.
 *
 * Every admin route builds its error component from this one call, passing the
 * message helper for whatever it loads:
 *
 *   errorComponent: routeErrorComponent(getAdminOverviewErrorMessage)
 *
 * **The page draws nothing of its own here, and that is deliberate.** This used
 * to put the banner inside a `TableSurface`, from when the banner was a strip
 * you could see. It is a toast now and renders nothing, so the surface was left
 * holding nothing — and an empty surface is not empty on screen: it is a box of
 * no height wearing a one-pixel ring, which paints as a stray line straight
 * across the page under the header. Anything added back here has to be
 * something a reader can actually see.
 */
export function routeErrorComponent(getMessage: (error: unknown) => string) {
  return function RouteError({ error }: ErrorComponentProps) {
    const router = useRouter()

    return (
      <ErrorBanner
        message={getMessage(error)}
        onRetry={() => void router.invalidate()}
      />
    )
  }
}

/** For a page with nothing of its own to name — the last resort at the root. */
export function getPageErrorMessage(error: unknown) {
  return error instanceof Error && error.message
    ? error.message
    : "This page could not be loaded."
}
