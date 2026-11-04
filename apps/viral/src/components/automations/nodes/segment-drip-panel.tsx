import { Link } from "@tanstack/react-router"

import {
  InspectorCard,
  InspectorNote,
} from "@/components/automations/inspector-card"
import { SegmentSelectField } from "@/components/automations/nodes/segment-select-field"
import { ErrorRow } from "@/components/ui/error-row"
import { LoadingRow } from "@/components/ui/loading-row"
import {
  getSegmentDripProgressErrorMessage,
  loadSegmentDripProgress,
} from "@/lib/api/automations/segment-drip"
import { describeNextBatch } from "@/lib/broadcasts/drip"
import type { AutomationNodeFieldsProps } from "@/lib/automations/node-descriptor"
import { readSegmentDrip } from "@/lib/automations/nodes/segment-drip"
import { plural } from "@/lib/format/plural"
import { useLoad } from "@/lib/hooks/use-load"

export default function SegmentDripFields({
  node,
  automationId,
  onChange,
}: AutomationNodeFieldsProps) {
  const { segmentId, segmentName } = readSegmentDrip(node.settings)

  return (
    <>
      <InspectorCard title="Settings">
        <SegmentSelectField
          id={`segment-drip-${node.id}`}
          segmentId={segmentId}
          segmentName={segmentName}
          onChange={(segment) =>
            onChange({ ...node, settings: { ...node.settings, ...segment } })
          }
        />

        <InspectorNote>
          Switching the flow on lets the people already in the segment in a
          batch at a time, then anyone who joins later. Each person goes through
          once, even if the flow is switched off and on again.
        </InspectorNote>
      </InspectorCard>

      {automationId && segmentId ? (
        <SegmentDripProgressCard
          automationId={automationId}
          segmentId={segmentId}
        />
      ) : null}
    </>
  )
}

/** How far through the segment the saved flow is, and at what pace. */
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

  const nextBatch = progress ? describeNextBatch(progress.nextBatchAt) : null

  return (
    <InspectorCard title="Progress">
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
          {nextBatch ? (
            <p className="text-muted-foreground">{nextBatch}.</p>
          ) : null}
        </div>
      )}

      <InspectorNote>
        {progress ? `${progress.pace} ` : null}
        The pace is the drip rules in{" "}
        <Link
          to="/admin/settings/$tab"
          params={{ tab: "email" }}
          className="underline underline-offset-2 hover:text-foreground"
        >
          Settings &gt; Email
        </Link>
        , and its sending hours hold back the Waits in this flow too.
      </InspectorNote>
    </InspectorCard>
  )
}
