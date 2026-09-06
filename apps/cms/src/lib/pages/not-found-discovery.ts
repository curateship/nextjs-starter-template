import type { PublicNavigationLink } from "@/lib/pages/public-navigation"

/** Public links a not-found response can offer without relying on root data. */
export type PublicNotFoundDiscovery = {
  publicNavigation: PublicNavigationLink[]
  publicSearchEnabled: boolean
}
