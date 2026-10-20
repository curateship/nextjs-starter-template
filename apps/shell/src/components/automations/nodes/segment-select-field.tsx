import * as React from "react"
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
  type SegmentChoice,
} from "@/lib/api/people/contact-segments"

/**
 * The segment dropdown both segment starts use, with its loading, retry and
 * "there are no segments yet" states. A segment that has since been deleted
 * stays in the list under its old name, so opening the step cannot quietly
 * change it.
 */
export function SegmentSelectField({
  id,
  segmentId,
  segmentName,
  onChange,
}: {
  id: string
  segmentId: string
  segmentName: string
  onChange: (segment: { segmentId: string; segmentName: string }) => void
}) {
  const [segments, setSegments] = React.useState<SegmentChoice[] | null>(null)
  const [loadError, setLoadError] = React.useState("")
  const [loadAttempt, setLoadAttempt] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    loadSegmentChoices()
      .then((rows) => {
        if (!cancelled) setSegments(rows)
      })
      .catch((error) => {
        if (!cancelled) setLoadError(getSegmentLoadErrorMessage(error))
      })
    return () => {
      cancelled = true
    }
  }, [loadAttempt])

  const segmentKnown = (segments ?? []).some(
    (segment) => segment.id === segmentId
  )

  return (
    <>
      <div className="grid gap-2">
        <FieldLabel
          htmlFor={id}
          className="text-xs"
          hint="Both rules-based and hand-picked segments work. The flow notices changes within about 15 seconds."
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
            {segmentId && !segmentKnown ? (
              <SelectItem value={segmentId}>
                {segmentName || "A segment that no longer exists"}
              </SelectItem>
            ) : null}
          </SelectContent>
        </Select>
        {loadError ? (
          <ErrorRow
            message={loadError}
            onRetry={() => {
              setSegments(null)
              setLoadError("")
              setLoadAttempt((attempt) => attempt + 1)
            }}
          />
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
