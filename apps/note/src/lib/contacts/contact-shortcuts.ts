import {
  sameSegmentRules,
  segmentStatusLabels,
  type SegmentRules,
} from "@/lib/contacts/contact-segments"

/**
 * The rows of the People card on the Contacts dashboard's left panel: a count
 * each, and pressing one filters the list to those people.
 *
 * Each row is a set of segment rules, the same rules Filter writes, so a row
 * pressed and a rule picked by hand are one filter, and "Save to segment"
 * saves either as it is. The server counts these very rules, so the number on
 * a row is the number the list shows once it is pressed.
 *
 * Tyler, 19 Oct 2026: the rows use the words the list's badges use, and
 * "New this month" counts the last 30 days. Marked it spam has no row; Filter
 * still reaches it.
 */
export const NEW_CONTACT_DAYS = 30

export type ContactShortcutKey =
  | "subscribed"
  | "unsubscribed"
  | "bounced"
  | "cold"
  | "new"

export type ContactShortcut = {
  key: ContactShortcutKey
  label: string
  rules: SegmentRules
}

export const CONTACT_SHORTCUTS: readonly ContactShortcut[] = [
  {
    key: "subscribed",
    label: segmentStatusLabels.subscribed,
    rules: { conditions: [{ type: "status", operator: "is", status: "subscribed" }] },
  },
  {
    key: "unsubscribed",
    label: segmentStatusLabels.unsubscribed,
    rules: { conditions: [{ type: "status", operator: "is", status: "unsubscribed" }] },
  },
  {
    key: "bounced",
    label: segmentStatusLabels.bounced,
    rules: { conditions: [{ type: "status", operator: "is", status: "bounced" }] },
  },
  {
    key: "cold",
    label: segmentStatusLabels.cold,
    rules: { conditions: [{ type: "status", operator: "is", status: "cold" }] },
  },
  {
    key: "new",
    label: "New this month",
    rules: {
      conditions: [{ type: "joined", operator: "within", days: NEW_CONTACT_DAYS }],
    },
  },
]

/** Whether the list is showing exactly one row's people, so the row reads as on. */
export function shortcutIsOn(
  shortcut: ContactShortcut,
  rules: SegmentRules
): boolean {
  return sameSegmentRules(rules, shortcut.rules)
}
