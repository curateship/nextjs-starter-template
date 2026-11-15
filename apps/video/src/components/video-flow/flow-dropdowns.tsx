import * as React from "react"

import { NewRecordDropdown } from "@/components/shared/new-record-dropdown"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { PlayIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { createFlow, getFlowErrorMessage, startFlowRun } from "@/lib/api/video/flow"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { FLOW_NAME_MAX } from "@/lib/video/flow/flows"

/**
 * New flow, a dropdown under its button as every New on a dashboard is: a
 * name, for a blank canvas that opens in the builder. The flows in the table
 * are the templates (Tyler, 14 Nov 2026: "the flows are the templates"), so
 * one built from another is a Duplicate of its row.
 */
export function NewFlowDropdown({
  trigger,
  align,
  onCreated,
}: {
  trigger: React.ReactNode
  align?: "start" | "end"
  onCreated: (flowId: string) => Promise<void> | void
}) {
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState("")
  const [run, busy] = useAsyncAction(getFlowErrorMessage)
  const submit = () =>
    void run(async () => {
      const flow = await createFlow(name)
      setName("")
      setOpen(false)
      await onCreated(flow.id)
    })
  return (
    <NewRecordDropdown
      label="New flow"
      open={open}
      onOpenChange={setOpen}
      submitLabel="Create flow"
      busy={busy}
      onSubmit={submit}
      trigger={trigger}
      align={align}
    >
      <div className="grid gap-2">
        <FieldLabel htmlFor="new-flow-name">Name</FieldLabel>
        <Input
          id="new-flow-name"
          autoFocus
          value={name}
          maxLength={FLOW_NAME_MAX}
          placeholder="Talking head video"
          disabled={busy}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
    </NewRecordDropdown>
  )
}

/**
 * Run: starts a run of the flow at once and opens its stepped guide. There
 * is no project to pick here; that is the guide's last step (Tyler, 14 Nov
 * 2026, of the project box that was under Run: "this should be removed. its
 * the last step").
 */
export function RunFlowButton({
  flowId,
  children,
  onBeforeRun,
  onStarted,
  ...button
}: {
  flowId: string
  children: React.ReactNode
  /** Waits for anything to finish first, such as the builder's last save. */
  onBeforeRun?: () => Promise<void>
  onStarted: (runId: string) => Promise<void> | void
} & Omit<React.ComponentProps<typeof Button>, "onClick" | "children">) {
  const [run, busy] = useAsyncAction(getFlowErrorMessage)
  return (
    <Button
      type="button"
      {...button}
      // No spinner and no greying while the run starts (Tyler, 14 Nov 2026:
      // "remove the loading indicator in the run button"); a second press
      // while it starts is ignored, so it never starts two.
      onClick={() => {
        if (busy) return
        void run(async () => {
          await onBeforeRun?.()
          const { runId } = await startFlowRun(flowId)
          await onStarted(runId)
        })
      }}
    >
      <PlayIcon />
      {children}
    </Button>
  )
}
