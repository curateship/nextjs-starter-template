import type * as React from "react"

/**
 * A right panel's facts inside its `PanelCard`s, drawn as the shell's user
 * panel draws them (`src/components/admin-dashboard/user-panel.tsx`; Tyler,
 * 12 Nov 2026: "the right panel is mostly not using ui standards. Look at
 * how shell does it"). The shell keeps its own private; these are copied
 * from Promo's (`apps/promo/src/components/dashboard-page/detail-rows.tsx`)
 * for the Listings dashboard's records, never an edit of the shell's file.
 */

/** A card's list of facts. */
export function DetailRows({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-2">{children}</div>
}

/** A line of muted words in a card. */
export function DetailNote({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>
}

/**
 * A label and its value on one line, the way a spec sheet reads. The panel
 * opens narrow, so a value with no room beside its label goes under it
 * rather than past the panel's edge.
 *
 * `multiline` is for free text somebody wrote, such as why a placement was
 * revoked or the link a claimant gave: it goes under the label and wraps in
 * full, where a one-line value is cut short with no way to read the rest.
 */
export function DetailRow({
  label,
  value,
  multiline = false,
}: {
  label: string
  value: React.ReactNode
  multiline?: boolean
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-0.5">
      <span className="min-w-0 text-sm text-muted-foreground">{label}</span>
      {multiline ? (
        <span className="min-w-0 basis-full text-sm font-medium whitespace-pre-wrap wrap-anywhere">{value}</span>
      ) : (
        <span className="ml-auto min-w-0 max-w-full truncate text-right text-sm font-medium">{value}</span>
      )}
    </div>
  )
}
