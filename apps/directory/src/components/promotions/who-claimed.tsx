import { Trash2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { DisabledReason } from "@/components/ui/disabled-reason"
import type { DealClaim } from "@/lib/api/promotions/claims"
import { formatDate, formatDateTime } from "@/lib/format/format-time"

/**
 * Who claimed a deal, first to claim first: their name, email, code, day and
 * whether the code has been used at the counter. The admin can take a claim
 * away, which frees the place; the owner's copy is read-only.
 *
 * A used code is never taken away. The place has been had, and freeing it
 * would let that email claim a second code.
 */
export function WhoClaimedList({
  claims,
  onRemove,
  removingId,
}: {
  claims: DealClaim[]
  /** Only the admin's window can take a claim away. */
  onRemove?: (claim: DealClaim) => void
  removingId?: string | null
}) {
  if (claims.length === 0) {
    return <p className="text-sm text-muted-foreground">Nobody has claimed it yet.</p>
  }
  return (
    <ul className="-mx-3 divide-y border-y">
      {claims.map((claim) => (
        <li key={claim.id} className="flex items-center gap-2 px-3 py-2">
          <div className="grid min-w-0 flex-1 gap-0.5">
            <span className="truncate text-sm font-medium">{claim.name}</span>
            <span className="truncate text-xs text-muted-foreground">
              {claim.email} · {formatDate(claim.createdAt)}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {claim.usedAt
                ? `Used ${formatDateTime(claim.usedAt)}`
                : "Not used yet"}
            </span>
          </div>
          <span className="shrink-0 font-mono text-sm">{claim.code}</span>
          {onRemove ? (
            <DisabledReason
              disabled={claim.usedAt !== null}
              reason="That code has been used at the counter, so the claim stays on the list."
            >
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Take ${claim.name}'s claim away`}
                disabled={removingId === claim.id || claim.usedAt !== null}
                onClick={() => onRemove(claim)}
              >
                <Trash2Icon className="size-4" />
              </Button>
            </DisabledReason>
          ) : null}
        </li>
      ))}
    </ul>
  )
}
