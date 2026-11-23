import { Link } from "@tanstack/react-router"
import { SlidersHorizontalIcon } from "lucide-react"

import { InspectorCard, InspectorNote } from "@/components/automations/inspector-card"
import { ErrorRow } from "@/components/ui/error-row"
import { FieldLabel } from "@/components/ui/field-label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { getSequenceErrorMessage, loadSequences } from "@/lib/api/email/sequences"
import type { AutomationNodeFieldsProps } from "@/lib/automations/node-descriptor"
import { readSendSequence } from "@/lib/automations/nodes/send-sequence"
import { plural } from "@/lib/format/plural"
import { useLoad } from "@/lib/hooks/use-load"

/**
 * The Send sequence step's settings: which of the CRM's sequences it starts.
 * A sequence deleted since stays in the list under its old name, so opening
 * the step cannot quietly change it; the run says plainly that it has gone.
 */
export default function SendSequenceFields({ node, onChange }: AutomationNodeFieldsProps) {
  const { sequenceId, sequenceName } = readSendSequence(node.settings)
  const load = useLoad(loadSequences, getSequenceErrorMessage)
  const sequences = load.data
  const picked = (sequences ?? []).find((sequence) => sequence.id === sequenceId)
  const id = `send-sequence-${node.id}`

  return (
    <InspectorCard icon={<SlidersHorizontalIcon />} title="Settings">
      <div className="grid gap-2">
        <FieldLabel htmlFor={id} className="text-xs" hint="The sequences written in CRM, Broadcasts, Sequences.">
          Sequence
        </FieldLabel>
        <Select
          disabled={sequences === null}
          value={sequenceId || undefined}
          onValueChange={(value) => {
            const next = (sequences ?? []).find((sequence) => sequence.id === value)
            // The name rides along for the step card's wording only: the run
            // always looks the sequence up by id.
            onChange({ ...node, settings: { ...node.settings, sequenceId: value, sequenceName: next?.name ?? sequenceName } })
          }}
        >
          <SelectTrigger id={id} className="w-full sm:w-fit">
            <SelectValue placeholder={sequences === null ? "Loading sequences…" : "Choose a sequence"} />
          </SelectTrigger>
          <SelectContent>
            {(sequences ?? []).map((sequence) => (
              <SelectItem key={sequence.id} value={sequence.id}>
                {sequence.name}
              </SelectItem>
            ))}
            {sequenceId && sequences !== null && !picked ? (
              <SelectItem value={sequenceId}>{sequenceName || "A sequence that no longer exists"}</SelectItem>
            ) : null}
          </SelectContent>
        </Select>
        {load.error ? <ErrorRow message={load.error} onRetry={load.retry} /> : null}
      </div>

      <InspectorNote>
        {sendingLine(picked?.steps?.emails.length ?? null)}{" "}
        <Link
          to="/admin/crm"
          search={{ tab: "broadcasts", list: "sequences", ...(picked ? { open: picked.id } : {}) }}
          className="underline underline-offset-2 hover:text-foreground"
        >
          {picked ? `Open ${picked.name}` : "Write a sequence"}
        </Link>
      </InspectorNote>
    </InspectorCard>
  )
}

/** What happens when a person reaches the step, for the sequence picked. */
function sendingLine(emails: number | null) {
  const after = "The flow carries on at once."
  if (emails === 1) return `Its one email goes straight away. ${after}`
  if (emails) return `Email 1 goes straight away, then the other ${emails - 1} ${plural(emails - 1, "email")} after their waits. ${after}`
  return `Email 1 goes straight away, then each email after its wait. ${after}`
}
