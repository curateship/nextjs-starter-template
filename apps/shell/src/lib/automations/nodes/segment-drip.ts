import { UsersRoundIcon } from "lucide-react"
import { z } from "zod"

import { defineNode } from "../node-descriptor"
import { readJoinedSegment } from "./joined-segment"

/** Same two settings as the joined-segment start, read the same way. */
export const readSegmentDrip = readJoinedSegment

/**
 * Starts the flow for everybody in a segment, a few hundred people at a time,
 * and then for anybody who joins it later.
 *
 * This is the start a sequence needs. "Joined a segment" deliberately ignores
 * the people already there and stops the flow when more than a hundred arrive
 * at once, which is right for a welcome email and makes it impossible to put an
 * existing list through seven emails. This one lets the list in, but at the
 * pace in Settings > Email, so twenty thousand people become fifty batches
 * spread over days rather than one burst a mail server reads as spam.
 *
 * Each person gets a run of their own, so a Wait later in the flow is two days
 * from *their* email rather than from whenever the last batch went.
 */
export const segmentDripNode = defineNode({
  kind: "segmentDrip",
  palette: {
    key: "trigger-segment-drip",
    group: "Triggers",
    description: "Start for everyone in a segment, a few hundred at a time",
  },
  createSettings: () => ({ segmentId: "", segmentName: "" }),
  settingsSchema: z
    .object({
      segmentId: z.string().trim().max(36),
      segmentName: z.string().trim().max(120).default(""),
    })
    .refine((settings) => settings.segmentId !== "", {
      message: "Pick which segment this flow lets in.",
    }),
  name: () => "Segment, a few at a time",
  description: (settings) => {
    const { segmentName } = readSegmentDrip(settings)
    return segmentName
      ? `Lets everyone in "${segmentName}" in a few at a time, then anyone who joins later. Once per person.`
      : "Choose which segment this flow lets in."
  },
  icon: UsersRoundIcon,
  outputPorts: [{ id: "then", label: "Then" }],
  hasInput: false,
  manualStart: false,
  connectionError: () => null,
  fields: () => import("@/components/automations/nodes/segment-drip-panel"),
})
