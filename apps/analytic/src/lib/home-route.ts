const HOME_ROUTE_BASE = "http://analytic.local"
const HOME_REDIRECT_LOOPS = new Set(["/", "/admin", "/admin/"])

/** A normalized internal home target, excluding routes that redirect to home. */
export function configuredRouteTarget(
  adminRoute: string | null | undefined
): string | null {
  const target = (adminRoute ?? "").trim()
  if (!target.startsWith("/")) return null

  try {
    const url = new URL(target, HOME_ROUTE_BASE)
    if (
      url.origin !== HOME_ROUTE_BASE ||
      HOME_REDIRECT_LOOPS.has(url.pathname)
    ) {
      return null
    }
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return null
  }
}
