import { UserRoundPlusIcon } from "lucide-react"
import { z } from "zod"

import { defineNode } from "../node-descriptor"

export function readJoinedSegment(settings: Record<string, unknown>) {
  return {
    segmentId:
      typeof settings.segmentId === "string" ? settings.segmentId.trim() : "",
    segmentName:
      typeof settings.segmentName === "string"
        ? settings.segmentName.trim()
        : "",
  }
}

export const joinedSegmentNode = defineNode({
  kind: "joinedSegment",
  palette: {
    key: "trigger-joined-segment",
    group: "Triggers",
    description:
      "Start for people who join a segment, and if you choose, those already in it",
  },
  createSettings: () => ({ segmentId: "", segmentName: "" }),
  settingsSchema: z
    .object({
      segmentId: z.string().trim().max(36),
      segmentName: z.string().trim().max(120).default(""),
    })
    .refine((settings) => settings.segmentId !== "", {
      message: "Pick which segment starts this flow.",
    }),
  name: () => "Segment",
  description: (settings) => {
    const { segmentName } = readJoinedSegment(settings)
    return segmentName
      ? `Starts when somebody joins “${segmentName}”. Once per person.`
      : "Choose which segment starts this flow."
  },
  icon: UserRoundPlusIcon,
  outputPorts: [{ id: "then", label: "Then" }],
  hasInput: false,
  manualStart: false,
  connectionError: () => null,
  fields: () => import("@/components/automations/nodes/joined-segment-panel"),
})
