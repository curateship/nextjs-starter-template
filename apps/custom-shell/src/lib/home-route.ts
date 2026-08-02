import {
  canSeeShellEntry,
  isShellEntryNamed,
  isShellItem,
  type ShellSection,
} from "@/lib/custom-shell"

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
 * The first page in a sidebar — where home sends somebody who has not been
 * given a home route of their own.
 *
 * It walks the list the way the sidebar draws it, so what home opens is the
 * first thing they can see there, and it skips the same entries the rail skips:
 * dividers, hidden items, unnamed ones, and anything their role cannot see. A
 * parent's own page comes before its children, matching where the rail's first
 * click lands. Returns null when the sidebar is empty, which is a real state —
 * an admin can delete every member link and mean it.
 */
export function firstSidebarRoute(
  sections: ShellSection[] | null | undefined,
  role: string
): string | null {
  for (const section of sections ?? []) {
    for (const entry of section.entries) {
      if (!isShellItem(entry) || !entry.visible) continue
      if (!canSeeShellEntry(entry, role) || !isShellEntryNamed(entry)) continue

      const target = configuredRouteTarget(entry.href)
      if (target) return target

      for (const child of entry.children ?? []) {
        if (!canSeeShellEntry(child, role) || !isShellEntryNamed(child)) continue
        const childTarget = configuredRouteTarget(child.href)
        if (childTarget) return childTarget
      }
    }
  }

  return null
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
