import * as React from "react"
import { Loader2Icon, PauseIcon, PlayIcon, SquareIcon } from "lucide-react"

import { RainbowEdge } from "@/components/shared/rainbow-edge"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DisabledReason } from "@/components/ui/disabled-reason"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { FlowControl } from "@/lib/api/automations/automations"
import { plural } from "@/lib/format/plural"
import { cn } from "@/lib/utils"

export type FlowRunState = "off" | "running" | "paused"

/**
 * A flow's Run, Pause, Resume and Stop (Tyler, 23 Nov 2026: "Change the
 * \"live\" switch to a button called \"Run\"", then 24 Nov 2026: "If a run is
 * running then there should be 2 new buttons "Pause" and "Stop". The button
 * would look like this "Running 23 [pauseicon][stopicon]").
 *
 * Off, it is the Run button. Running, it is the people in the flow now inside
 * the moving rainbow edge, then a Pause and a Stop icon. Paused, the rainbow
 * goes, the words say Paused, and Pause becomes Resume. Only the icons press.
 * Stop asks first, because it cannot be undone: it takes everyone out of the
 * flow and the sequences it started.
 *
 * A flow that is on but was edited into something that cannot run reads Stop
 * alone, and the caller says why beside it.
 */
export function FlowRunButton({
  state,
  stalled = false,
  people,
  busy,
  disabled = false,
  blockedReason,
  flowName,
  size = "default",
  onAction,
}: {
  state: FlowRunState
  /** On, but its saved steps cannot run. */
  stalled?: boolean
  /** Everyone in the flow now; null until it has been counted. */
  people: number | null
  /** The action saving now, or null. */
  busy: FlowControl | null
  /** Another row's change is saving. */
  disabled?: boolean
  /** Why it cannot be run, or null when it can. */
  blockedReason: string | null
  flowName: string
  size?: "default" | "sm"
  /** Resolves true once the action is saved. */
  onAction: (action: FlowControl) => Promise<boolean>
}) {
  const [confirmStop, setConfirmStop] = React.useState(false)
  const locked = busy !== null || disabled
  const spinner = <Loader2Icon className="size-4 animate-spin" />

  const stop = async () => {
    if (await onAction("stop")) setConfirmStop(false)
  }
  const contacts = people === null ? null : `${people.toLocaleString("en-US")} ${plural(people, "contact", "contacts")}`
  const stopDialog = (
    <ConfirmDialog
      open={confirmStop}
      onOpenChange={setConfirmStop}
      title={`Stop ${flowName}?`}
      description={`${contacts ? `${contacts} ${people === 1 ? "is" : "are"}` : "Everyone in it is"} taken out and get no more email from it or the sequences it started. If the flow lets them in again after you press Run, they start from the first step. This can't be undone.`}
      confirmLabel="Stop"
      loading={busy === "stop"}
      onConfirm={() => void stop()}
    />
  )

  if (state === "off") {
    return (
      <DisabledReason disabled={blockedReason !== null} reason={blockedReason}>
        <Button
          type="button"
          size={size}
          disabled={locked || blockedReason !== null}
          aria-label={`Run ${flowName}`}
          onClick={() => void onAction("run")}
        >
          {busy === "run" ? spinner : <PlayIcon className="size-4" />}
          Run
        </Button>
      </DisabledReason>
    )
  }

  if (stalled) {
    return (
      <>
        <Button
          type="button"
          variant="outline"
          size={size}
          disabled={locked}
          aria-label={`Stop ${flowName}`}
          onClick={() => setConfirmStop(true)}
        >
          <SquareIcon className="size-3.5" />
          Stop
        </Button>
        {stopDialog}
      </>
    )
  }

  const paused = state === "paused"
  const words = `${paused ? "Paused" : "Running"}${contacts ? ` ${contacts}` : ""}`
  const group = (
    <span
      role="group"
      aria-label={`${flowName}: ${words}`}
      className={cn(
        "relative flex items-center gap-0.5 rounded-lg bg-background pr-0.5 whitespace-nowrap tabular-nums",
        size === "sm" ? "h-7 pl-2.5 text-[0.8rem]" : "h-8 pl-2.5 text-sm"
      )}
    >
      <span className="mr-1 font-medium">{words}</span>
      <IconButton
        label={paused ? "Resume" : "Pause"}
        ariaLabel={`${paused ? "Resume" : "Pause"} ${flowName}`}
        size={size}
        disabled={locked}
        onClick={() => void onAction(paused ? "resume" : "pause")}
      >
        {busy === "pause" || busy === "resume" ? spinner : paused ? <PlayIcon /> : <PauseIcon />}
      </IconButton>
      <IconButton
        label="Stop and clear everyone"
        ariaLabel={`Stop ${flowName}`}
        size={size}
        disabled={locked}
        onClick={() => setConfirmStop(true)}
      >
        <SquareIcon className="size-3.5" />
      </IconButton>
    </span>
  )

  return (
    <>
      {paused ? (
        // A still, one-pixel edge in the divider colour, the rainbow's size.
        <span className="inline-flex shrink-0 rounded-lg bg-border p-px">{group}</span>
      ) : (
        <RainbowEdge>{group}</RainbowEdge>
      )}
      {stopDialog}
    </>
  )
}

function IconButton({
  label,
  ariaLabel,
  size,
  disabled,
  onClick,
  children,
}: {
  label: string
  ariaLabel: string
  size: "default" | "sm"
  disabled: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size={size === "sm" ? "icon-xs" : "icon-sm"}
          disabled={disabled}
          aria-label={ariaLabel}
          onClick={onClick}
          className="focus-visible:ring-inset"
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
