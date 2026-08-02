const HOME_ROUTE_BASE = "http://custom-shell.local"
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

/**
 * Carries a request for an account tab into the home redirect.
 *
 * Home forwards an admin to their configured page. That redirect uses a bare
 * address, so a link arriving with `?account=billing` — the button straight
 * after a payment, or "Back to billing" on the pricing page — would land on the
 * configured page with no window open at all.
 */
export function withAccountTab(
  target: string,
  accountTab: string | null | undefined
) {
  if (!accountTab) return target

  const url = new URL(target, HOME_ROUTE_BASE)
  url.searchParams.set("account", accountTab)
  return `${url.pathname}${url.search}${url.hash}`
}
