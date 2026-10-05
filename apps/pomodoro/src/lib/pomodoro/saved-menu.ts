import type { PublicDevice } from "@/lib/pages/public-device"
import {
  isPublicNavigationGroup,
  type PublicNavigationItem,
  type PublicNavigationLink,
} from "@/lib/pages/public-navigation"

/** The product's own screens, so the sidebar never lists one of them twice. */
function sameAddress(href: string, addresses: readonly string[]) {
  const path = href.split(/[?#]/)[0]?.replace(/\/+$/, "") || "/"
  return addresses.some((address) => address === path)
}

/**
 * The pages an admin added to the public menu, as rows for the product
 * sidebar.
 *
 * The product's own screens are a fixed list in the shell component, because a
 * member cannot be left without the timer because somebody edited a menu.
 * These are added below them, so a page written in Settings → Pages and put in
 * the menu is reachable from inside the product instead of only from the
 * signed-out header.
 *
 * Groups are flattened to their links. A sidebar row is one address, and a
 * group is a hover panel the sidebar has no room for.
 */
export function savedMenuLinks(
  items: PublicNavigationItem[],
  productAddresses: readonly string[]
): PublicNavigationLink[] {
  const flattened = items.flatMap((item) =>
    isPublicNavigationGroup(item) ? item.links : [item]
  )
  const seen = new Set<string>()
  return flattened.filter((link) => {
    if (!link.href || !link.label) return false
    if (sameAddress(link.href, productAddresses)) return false
    if (seen.has(link.href)) return false
    seen.add(link.href)
    return true
  })
}

/**
 * The classes that hide a saved row on the widths it is not meant for.
 *
 * Classes rather than a measured width, so one list of rows is rendered once
 * and the server and the browser cannot disagree. The line is `lg`, the width
 * the product sidebar itself swaps its rail for a drawer, which is also where
 * the shell's public header swaps its row for its phone panel.
 */
export function publicDeviceSidebarClassName(device: PublicDevice | undefined) {
  if (device === "desktop") return "max-lg:hidden"
  if (device === "phone") return "lg:hidden"
  return ""
}
