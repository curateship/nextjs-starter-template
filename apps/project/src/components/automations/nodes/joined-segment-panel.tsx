import {
  InspectorCard,
  InspectorNote,
} from "@/components/automations/inspector-card"
import { SegmentSelectField } from "@/components/automations/nodes/segment-select-field"
import type { AutomationNodeFieldsProps } from "@/lib/automations/node-descriptor"
import { readJoinedSegment } from "@/lib/automations/nodes/joined-segment"

export default function JoinedSegmentFields({
  node,
  onChange,
}: AutomationNodeFieldsProps) {
  const { segmentId, segmentName } = readJoinedSegment(node.settings)

  return (
    <InspectorCard title="Settings">
      <SegmentSelectField
        id={`joined-segment-${node.id}`}
        segmentId={segmentId}
        segmentName={segmentName}
        onChange={(segment) =>
          onChange({ ...node, settings: { ...node.settings, ...segment } })
        }
      />

      <InspectorNote>
        Switching the flow on records who is already there and starts nothing.
        Each person can start this flow once, even if they leave and rejoin.
      </InspectorNote>
    </InspectorCard>
  )
}
