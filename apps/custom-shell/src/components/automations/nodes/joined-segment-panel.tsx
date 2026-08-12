import * as React from "react"
import { Link } from "@tanstack/react-router"

import {
  InspectorCard,
  InspectorNote,
} from "@/components/automations/inspector-card"
import { ErrorBanner } from "@/components/ui/error-banner"
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
import type {
  AutomationNodeFieldsProps,
  AutomationNodeSettings,
} from "@/lib/automations/node-descriptor"
import { readJoinedSegment } from "@/lib/automations/nodes/joined-segment"

export default function JoinedSegmentFields({
  node,
  onChange,
}: AutomationNodeFieldsProps) {
  const { segmentId, segmentName } = readJoinedSegment(node.settings)
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
  const setSettings = (settings: AutomationNodeSettings) =>
    onChange({ ...node, settings: { ...node.settings, ...settings } })

  return (
    <InspectorCard title="Settings">
      <div className="grid gap-2">
        <FieldLabel
          htmlFor={`joined-segment-${node.id}`}
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
            setSettings({
              segmentId: value,
              segmentName: picked?.name ?? segmentName,
            })
          }}
        >
          <SelectTrigger id={`joined-segment-${node.id}`} className="w-full">
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
          <ErrorBanner
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
            to="/admin/segments"
            className="underline underline-offset-2 hover:text-foreground"
          >
            Segments
          </Link>
          .
        </InspectorNote>
      ) : null}

      <InspectorNote>
        Switching the flow on records who is already there and starts nothing.
        Each person can start this flow once, even if they leave and rejoin.
      </InspectorNote>
    </InspectorCard>
  )
}
