const HOME_ROUTE_BASE = "http://custom-shell.local"
// Addresses a home setting must never point at. `/home` is the page that reads
// this very setting, so pointing it back at itself is either a loop or a no-op;
// `/` is the public front page; `/admin` forwards to the configured admin page.
const HOME_REDIRECT_LOOPS = new Set([
  "/",
  "/home",
  "/home/",
  "/admin",
  "/admin/",
])

/**
 * Where an admin lands when they have not chosen a page of their own — what
 * an empty `adminRoute` setting means.
 *
 * Kept here rather than written out at each redirect, because there are two of
 * them and the copy on Settings → General has to say the same thing.
 */
export const DEFAULT_ADMIN_ROUTE = "/admin/dashboard"

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
