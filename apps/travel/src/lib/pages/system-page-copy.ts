import {
  resolveMaintenanceCopy,
  resolveNotFoundCopy,
  type PublicSystemCopy,
} from "@/lib/pages/public-metadata"

/**
 * The two pages the shell draws itself whose words an admin may change: the
 * one a dead link lands on, and the one the whole app is behind while it is
 * closed.
 *
 * Keyed by address, because that is how the Pages screen knows a page. Both
 * read their words out of the same saved pair of fields, so the panel
 * works out which pair from the address alone.
 *
 * Their words are changed on the page's own right panel in the Admin
 * dashboard's Pages section (`page-panel.tsx`). They were a window opened
 * from the Pages list until 9 Nov 2026, and a settings card before 4 Oct.
 */
export const SYSTEM_PAGE_COPY = {
  "/404": {
    title: "Page not found",
    description:
      "What a visitor sees when a link is dead or an address was mistyped.",
    headingField: "notFoundHeading",
    bodyField: "notFoundBody",
    resolve: (copy: PublicSystemCopy) => resolveNotFoundCopy(copy),
  },
  "/maintenance": {
    title: "Maintenance",
    description:
      "What everyone sees while the app is closed. Switching maintenance on is a different control, in General settings.",
    headingField: "maintenanceHeading",
    bodyField: "maintenanceBody",
    resolve: (copy: PublicSystemCopy) => resolveMaintenanceCopy(copy),
  },
} as const satisfies Record<
  string,
  {
    title: string
    description: string
    headingField: keyof PublicSystemCopy
    bodyField: keyof PublicSystemCopy
    resolve: (copy: PublicSystemCopy) => { heading: string; body: string }
  }
>

/** Whether this address is a page whose words can be changed on this screen. */
export function hasSystemPageCopy(
  path: string
): path is keyof typeof SYSTEM_PAGE_COPY {
  return path in SYSTEM_PAGE_COPY
}
