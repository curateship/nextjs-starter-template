import { Loader2Icon, PlayIcon, SquareIcon } from "lucide-react"

import { RainbowEdge } from "@/components/shared/rainbow-edge"
import { Button } from "@/components/ui/button"
import { DisabledReason } from "@/components/ui/disabled-reason"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { plural } from "@/lib/format/plural"

/**
 * A flow's on and off, as a button (Tyler, 23 Nov 2026: "Change the \"live\"
 * switch to a button called \"Run\" after clicked the button changes to a
 * rainbow color with a live update in the button itself"). Off, it reads Run.
 * Running, it has the moving rainbow edge and says how many people are in the
 * flow now ("Running 122 contacts"; Tyler, 23 Nov 2026: "rename the \"In
 * it\" to \"Running 122 contacts\""), and pressing it stops the flow, the same
 * as switching Live off did: everyone held at a Drip or a Wait stops there.
 *
 * A flow that is on but was edited into something that cannot run has no
 * rainbow: it reads Stop, and the caller says why beside it.
 */
export function FlowRunButton({
  live,
  stalled = false,
  people,
  busy,
  disabled = false,
  blockedReason,
  flowName,
  size = "default",
  onChange,
}: {
  live: boolean
  /** On, but its saved steps cannot run. */
  stalled?: boolean
  /** Everyone in the flow now; null until it has been counted. */
  people: number | null
  /** Its change is saving. */
  busy: boolean
  /** Another row's change is saving. */
  disabled?: boolean
  /** Why it cannot be switched on, or null when it can. */
  blockedReason: string | null
  flowName: string
  size?: "default" | "sm"
  onChange: (next: boolean) => void
}) {
  const icon = busy ? <Loader2Icon className="size-4 animate-spin" /> : null

  if (!live) {
    return (
      <DisabledReason disabled={blockedReason !== null} reason={blockedReason}>
        <Button
          type="button"
          size={size}
          disabled={busy || disabled || blockedReason !== null}
          aria-label={`Run ${flowName}`}
          onClick={() => onChange(true)}
        >
          {icon ?? <PlayIcon className="size-4" />}
          Run
        </Button>
      </DisabledReason>
    )
  }

  if (stalled) {
    return (
      <Button
        type="button"
        variant="outline"
        size={size}
        disabled={busy || disabled}
        aria-label={`Stop ${flowName}`}
        onClick={() => onChange(false)}
      >
        {icon ?? <SquareIcon className="size-3.5" />}
        Stop
      </Button>
    )
  }

  const contacts = people === null ? "" : `${people.toLocaleString("en-US")} ${plural(people, "contact", "contacts")}`
  const running = people === null ? "Running" : `Running ${contacts}`
  return (
    <Tooltip>
      <RainbowEdge>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size={size}
            disabled={busy || disabled}
            aria-label={
              people === null
                ? `Stop ${flowName}. It is running.`
                : `Stop ${flowName}. It is running with ${contacts}.`
            }
            onClick={() => onChange(false)}
            className="relative border-transparent bg-background tabular-nums hover:bg-muted focus-visible:ring-inset dark:bg-background"
          >
            {icon}
            {running}
          </Button>
        </TooltipTrigger>
      </RainbowEdge>
      <TooltipContent>Stop this flow</TooltipContent>
    </Tooltip>
  )
}
