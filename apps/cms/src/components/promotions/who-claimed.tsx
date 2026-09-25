import { Trash2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { DealClaim } from "@/lib/api/promotions/claims"
import { formatDate } from "@/lib/format/format-time"

/**
 * Who claimed a deal, first to claim first: their name, email, code and day.
 * The admin can take a claim away, which frees the place; the owner's copy is
 * read-only.
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
          </div>
          <span className="shrink-0 font-mono text-sm">{claim.code}</span>
          {onRemove ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Take ${claim.name}'s claim away`}
              disabled={removingId === claim.id}
              onClick={() => onRemove(claim)}
            >
              <Trash2Icon className="size-4" />
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  )
}
