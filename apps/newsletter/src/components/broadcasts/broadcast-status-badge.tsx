import {
  CheckIcon,
  ClockIcon,
  Loader2Icon,
  PauseIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import type { BroadcastStatus } from "@/lib/api/broadcasts"

const STATUS_META: Record<
  BroadcastStatus,
  {
    label: string
    variant: "default" | "secondary" | "outline" | "destructive"
    icon: React.ComponentType<{ className?: string }> | null
  }
> = {
  draft: { label: "Draft", variant: "outline", icon: null },
  scheduled: { label: "Scheduled", variant: "secondary", icon: ClockIcon },
  sending: { label: "Sending", variant: "default", icon: Loader2Icon },
  paused: { label: "Paused", variant: "destructive", icon: PauseIcon },
  sent: { label: "Sent", variant: "secondary", icon: CheckIcon },
}

export function BroadcastStatusBadge({ status }: { status: BroadcastStatus }) {
  const meta = STATUS_META[status]
  const Icon = meta.icon
  return (
    <Badge variant={meta.variant}>
      {Icon ? (
        <Icon className={status === "sending" ? "animate-spin" : undefined} />
      ) : null}
      {meta.label}
    </Badge>
  )
}
