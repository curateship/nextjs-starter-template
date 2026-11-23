import { Link } from "@tanstack/react-router"

import { InspectorNote } from "@/components/automations/inspector-card"
import { ErrorRow } from "@/components/ui/error-row"
import { FieldLabel } from "@/components/ui/field-label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  getSegmentLoadErrorMessage,
  loadSegmentChoices,
} from "@/lib/api/people/contact-segments"
import { useLoad } from "@/lib/hooks/use-load"

/**
 * The segment dropdown every segment step uses, with its loading, retry and
 * "there are no segments yet" states. A segment that has since been deleted
 * stays in the list under its old name, so opening the step cannot quietly
 * change it.
 */
export function SegmentSelectField({
  id,
  segmentId,
  segmentName,
  hint = "Both rules-based and hand-picked segments work. The flow notices changes within about 15 seconds.",
  onChange,
}: {
  id: string
  segmentId: string
  segmentName: string
  /** The line under the label's help icon. */
  hint?: string
  onChange: (segment: { segmentId: string; segmentName: string }) => void
}) {
  const load = useLoad(loadSegmentChoices, getSegmentLoadErrorMessage)
  const segments = load.data

  const segmentKnown = (segments ?? []).some(
    (segment) => segment.id === segmentId
  )

  return (
    <>
      <div className="grid gap-2">
        <FieldLabel
          htmlFor={id}
          className="text-xs"
          hint={hint}
        >
          Segment
        </FieldLabel>
        <Select
          disabled={segments === null}
          value={segmentId || undefined}
          onValueChange={(value) => {
            const picked = (segments ?? []).find(
              (segment) => segment.id === value
            )
            // The name rides along for the node card's wording only — the
            // run always looks the segment up by id.
            onChange({
              segmentId: value,
              segmentName: picked?.name ?? segmentName,
            })
          }}
        >
          <SelectTrigger id={id} className="w-full sm:w-fit">
            <SelectValue
              placeholder={
                segments === null ? "Loading segments…" : "Choose a segment"
              }
            />
          </SelectTrigger>
          <SelectContent>
            {(segments ?? []).map((segment) => (
              <SelectItem key={segment.id} value={segment.id}>
                {segment.name}
              </SelectItem>
            ))}
            {/* A flow can point at a segment that has since been deleted.
                Keep it selectable so opening the step cannot silently change
                who the flow means; the run says plainly if it has gone. */}
            {segmentId && !segmentKnown ? (
              <SelectItem value={segmentId}>
                {segmentName || "A segment that no longer exists"}
              </SelectItem>
            ) : null}
          </SelectContent>
        </Select>
        {load.error ? (
          <ErrorRow message={load.error} onRetry={load.retry} />
        ) : null}
      </div>

      {segments?.length === 0 ? (
        <InspectorNote>
          There are no segments yet. Make one in{" "}
          <Link
            to="/admin/contacts"
            className="underline underline-offset-2 hover:text-foreground"
          >
            Contacts
          </Link>
          .
        </InspectorNote>
      ) : null}
    </>
  )
}
