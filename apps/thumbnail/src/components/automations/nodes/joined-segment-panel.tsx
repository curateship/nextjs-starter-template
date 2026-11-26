import { ListChecksIcon, SlidersHorizontalIcon } from "lucide-react"

import {
  InspectorCard,
  InspectorNote,
} from "@/components/automations/inspector-card"
import { SegmentSelectField } from "@/components/automations/nodes/segment-select-field"
import { ErrorRow } from "@/components/ui/error-row"
import { FieldLabel } from "@/components/ui/field-label"
import { LoadingRow } from "@/components/ui/loading-row"
import { Switch } from "@/components/ui/switch"
import {
  getSegmentDripProgressErrorMessage,
  loadSegmentDripProgress,
} from "@/lib/api/automations/segment-drip"
import type { AutomationNodeFieldsProps } from "@/lib/automations/node-descriptor"
import {
  joinedSegmentNode,
  readJoinedSegment,
} from "@/lib/automations/nodes/joined-segment"
import { segmentDripNode } from "@/lib/automations/nodes/segment-drip"
import { plural } from "@/lib/format/plural"
import { useLoad } from "@/lib/hooks/use-load"

/**
 * The one "Segment" panel, for both segment starts.
 *
 * The switch decides whether the people already in the segment get the flow.
 * Off is the `joinedSegment` kind: only people who join from now on, straight
 * away. On is the `segmentDrip` kind: everyone already there, then anyone who
 * joins later, with a Drip step after it spacing them out. The switch changes the node's kind rather than
 * adding a setting, so every flow saved before the two were one card keeps its
 * kind and runs exactly as it did.
 */
export default function JoinedSegmentFields({
  node,
  automationId,
  onChange,
}: AutomationNodeFieldsProps) {
  const { segmentId, segmentName } = readJoinedSegment(node.settings)
  const includeExisting = node.kind === segmentDripNode.kind
  const switchId = `joined-segment-${node.id}-existing`

  return (
    <>
      <InspectorCard icon={<SlidersHorizontalIcon />} title="Settings">
        <SegmentSelectField
          id={`joined-segment-${node.id}`}
          segmentId={segmentId}
          segmentName={segmentName}
          onChange={(segment) =>
            onChange({ ...node, settings: { ...node.settings, ...segment } })
          }
        />

        <div className="flex items-center justify-between gap-3">
          <FieldLabel htmlFor={switchId} className="text-xs">
            Also send to people already in this segment
          </FieldLabel>
          <Switch
            id={switchId}
            checked={includeExisting}
            onCheckedChange={(checked) =>
              onChange({
                ...node,
                kind: checked ? segmentDripNode.kind : joinedSegmentNode.kind,
              })
            }
          />
        </div>

        <InspectorNote>
          {includeExisting
            ? "Switching the flow on lets everyone already in the segment in, then anyone who joins later. Add a Drip step after this one to send to them a few at a time; the flow cannot go live without one. Each person goes through once, even if the flow is switched off and on again."
            : "Only people who join from now on start this flow, straight away. If more than 100 join at once the flow stops, in case the segment changed by mistake. Each person can start it once, even if they leave and rejoin."}
        </InspectorNote>
      </InspectorCard>

      {includeExisting && automationId && segmentId ? (
        <SegmentDripProgressCard
          automationId={automationId}
          segmentId={segmentId}
        />
      ) : null}
    </>
  )
}

/** How far through the segment the saved flow is. */
function SegmentDripProgressCard({
  automationId,
  segmentId,
}: {
  automationId: string
  segmentId: string
}) {
  const load = useLoad(
    () => loadSegmentDripProgress(automationId),
    getSegmentDripProgressErrorMessage,
    // The segment is in the list so picking another one reads again.
    { keys: [automationId, segmentId] }
  )
  const progress = load.data

  return (
    <InspectorCard icon={<ListChecksIcon />} title="Progress">
      {load.error ? (
        <ErrorRow
          message={load.error}
          onRetry={() => {
            load.setData(null)
            load.retry()
          }}
        />
      ) : !progress ? (
        <LoadingRow label="Counting the segment…" className="py-4 text-xs" />
      ) : (
        <div className="grid gap-1 text-xs">
          <p className="font-medium text-foreground">
            {progress.letIn.toLocaleString()} let in,{" "}
            {progress.waiting.toLocaleString()}{" "}
            {plural(progress.waiting, "person", "people")} still to go.
          </p>
        </div>
      )}

      <InspectorNote>
        The pace is the Drip step's after this one.
      </InspectorNote>
    </InspectorCard>
  )
}
