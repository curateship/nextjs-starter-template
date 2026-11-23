import type { ComponentType } from "react"
import type { LucideIcon } from "lucide-react"

import type { AnalyticsRange } from "@/lib/analytics/range"

/**
 * What an app adds to the Admin dashboard from its own `src/app/options.ts`,
 * never by editing the shell (Tyler, 8 Nov 2026: "each individual app can
 * add its own block and widget without having to modify shell"):
 *
 * - **Blocks** are "/" blocks on the Admin dashboard's page, listed
 *   after the shell's under Advanced blocks.
 * - **Widgets** are cards on Overview, offered in the Widgets tab of the
 *   Admin ⋮ and in each widget's ⋮, after the shell's nine.
 *
 * `load` is **a pointer to another file, never the component itself**, for
 * the reason written on `AppSettingsTab.panel`: the component reads its own
 * figures through `@/lib/api/*`, and this type is reachable from the server.
 * A function returning an import is not followed until a browser draws it.
 * `docs/shell/admin-blocks-and-widgets.md` has an example.
 */

/** What an app's block or widget is handed: the range picked on Overview. */
export type AdminAdditionProps = { days: AnalyticsRange }

export type AdminAddition = {
  /**
   * Lower-case letters, digits and single dashes, starting with a letter:
   * `trip-count`. It names the saved block or widget, so changing it later
   * loses every one already placed. A key the shell uses, or one used twice,
   * is refused out loud on the first read.
   */
  key: string
  label: string
  icon: LucideIcon
  load: () => Promise<{ default: ComponentType<AdminAdditionProps> }>
}

/** Identity helper so a literal stays fully typed at the definition. */
export function defineAdminAddition(addition: AdminAddition): AdminAddition {
  return addition
}

const KEY_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/

/**
 * The editor node an app's block is saved as, worked out from its key so an
 * app never names one: `trip-count` is `noteAdminAppTripCount`.
 */
export function appBlockNodeName(key: string) {
  const words = key.split("-").map((word) => word.charAt(0).toUpperCase() + word.slice(1))
  return `noteAdminApp${words.join("")}`
}

/**
 * An app's list checked against the shell's keys. A bad key, a key the shell
 * already uses, or two entries sharing one would leave a block or widget
 * that can never be placed, so each is refused out loud.
 */
export function checkAdminAdditions(
  kind: "block" | "widget",
  additions: readonly AdminAddition[],
  shellKeys: readonly string[],
  /** Which dashboard, for the messages. */
  dashboard: "Admin" | "CRM" = "Admin"
): readonly AdminAddition[] {
  const seen = new Set<string>()
  for (const addition of additions) {
    if (!KEY_PATTERN.test(addition.key)) {
      throw new Error(
        `The ${dashboard} ${kind} key "${addition.key}" is not allowed. Use lower-case letters, digits and single dashes, starting with a letter.`
      )
    }
    if (shellKeys.includes(addition.key)) {
      throw new Error(
        `"${addition.key}" is one of the shell's own ${dashboard} ${kind}s. An app's own ${kind} needs a key the shell isn't already using.`
      )
    }
    if (seen.has(addition.key)) {
      throw new Error(`Two ${dashboard} ${kind}s both call themselves "${addition.key}". Each one needs its own key.`)
    }
    seen.add(addition.key)
  }
  return additions
}
