import { Link } from "@tanstack/react-router"

import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  describeDuplicateMatch,
  type DuplicateMatch,
} from "@/lib/directory/submission-duplicates"

/**
 * "This looks like Luigi's Pizza, already listed", once per listing it looks
 * like, with what matched and a way to open it.
 *
 * A published one also offers to reject with a pointer: the email then tells
 * the sender the business is already listed and gives them its claim button,
 * so an owner who missed their own page ends up looking after it. A draft has
 * no page a stranger could open, so it only gets the link.
 */
export function DuplicateWarning({
  duplicates,
  busy,
  onReject,
}: {
  duplicates: DuplicateMatch[]
  busy: boolean
  onReject: (listingId: string) => void
}) {
  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">Check before approving. Nothing is rejected unless you say so.</p>
      <div className="grid gap-4">
        {duplicates.map((match) => (
          <div
            key={match.listingId}
            className="grid gap-2"
          >
            <div className="grid min-w-0 gap-1">
              <p className="text-sm">
                This looks like{" "}
                <Link
                  to="/admin/listings"
                  search={{ open: match.listingId }}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {match.title}
                </Link>
                , already listed
                {match.status === "published"
                  ? "."
                  : match.status === "closed"
                    ? " and marked permanently closed."
                    : " as a draft."}
              </p>
              <p className="text-xs text-muted-foreground">
                {describeDuplicateMatch(match.matched)}
              </p>
            </div>
            {match.status === "published" ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-fit"
                disabled={busy}
                onClick={() => onReject(match.listingId)}
              >
                Reject, point to it
              </Button>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * One read-only line. Empty answers say so rather than leaving a gap. The
 * event suggestions window uses it too.
 */
export function SubmissionDetail({
  label,
  value,
  multiline,
}: {
  label: string
  value?: string
  multiline?: boolean
}) {
  return (
    <div className="grid gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {multiline || !value ? (
        <p
          className={`text-sm ${multiline ? "whitespace-pre-wrap" : "truncate"} ${
            value ? "" : "text-muted-foreground"
          }`}
        >
          {value || "Not given"}
        </p>
      ) : (
        // One line cut short: the whole value is a hover away.
        <Tooltip>
          <TooltipTrigger asChild>
            <p className="truncate text-sm">{value}</p>
          </TooltipTrigger>
          <TooltipContent>{value}</TooltipContent>
        </Tooltip>
      )}
    </div>
  )
}
