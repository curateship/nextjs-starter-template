import { Badge } from "@/components/ui/badge"
import { Meter } from "@/components/ui/meter"
import {
  SEQUENCE_STATUS_BADGE,
  SEQUENCE_STATUS_LABELS,
  type SequencePersonStatus,
} from "@/lib/broadcasts/sequence-progress"
import { cn } from "@/lib/utils"

/**
 * How far somebody has got through a sequence: a bar and "2 of 5" beside it
 * (Tyler, 22 Nov 2026: "Emails sent of total"). Full and green once the last
 * email has gone.
 */
export function SequenceProgressBar({ sent, total }: { sent: number; total: number }) {
  const done = total > 0 && sent >= total
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Meter
        value={sent}
        max={total}
        size="sm"
        tone={done ? "positive" : "default"}
        label="Emails sent"
        valueText={`${sent} of ${total} emails sent`}
        className="w-16 shrink-0"
      />
      <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
        {sent} of {total}
      </span>
    </span>
  )
}

/** The one word for a person or an email, in the old Directory app's colours. */
export function SequenceStatusBadge({ status }: { status: SequencePersonStatus }) {
  const colours = SEQUENCE_STATUS_BADGE[status]
  return (
    <Badge variant={colours ? "outline" : "secondary"} className={cn("font-normal", colours)}>
      {SEQUENCE_STATUS_LABELS[status]}
    </Badge>
  )
}
