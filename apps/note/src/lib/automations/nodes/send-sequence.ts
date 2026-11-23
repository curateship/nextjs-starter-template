import { ListOrderedIcon } from "lucide-react"
import { z } from "zod"

import { defineNode } from "../node-descriptor"

export function readSendSequence(settings: Record<string, unknown>) {
  return {
    sequenceId: typeof settings.sequenceId === "string" ? settings.sequenceId.trim() : "",
    sequenceName: typeof settings.sequenceName === "string" ? settings.sequenceName.trim() : "",
  }
}

/**
 * Puts the run's person into one of the CRM's sequences (Tyler, 16 Nov 2026:
 * "The trigger is set in automation. This just organizes sequence"). Email 1
 * goes straight away and the rest after their waits, on the sequence's own
 * run; this flow carries on to its next step at once.
 */
export const sendSequenceNode = defineNode({
  kind: "sendSequence",
  palette: {
    key: "flow-send-sequence",
    group: "Flow",
    description: "Start one of the CRM's sequences for this person",
  },
  createSettings: () => ({ sequenceId: "", sequenceName: "" }),
  settingsSchema: z
    .object({
      sequenceId: z.string().trim().max(36),
      sequenceName: z.string().trim().max(120).default(""),
    })
    .refine((settings) => settings.sequenceId !== "", {
      message: "Pick which sequence this step sends.",
    }),
  name: () => "Send sequence",
  description: (settings) => {
    const { sequenceName } = readSendSequence(settings)
    return sequenceName ? `Starts “${sequenceName}” for this person.` : "Choose which sequence to send."
  },
  icon: ListOrderedIcon,
  outputPorts: [{ id: "then", label: "Then" }],
  hasInput: true,
  connectionError: () => null,
  fields: () => import("@/components/automations/nodes/send-sequence-panel"),
})
