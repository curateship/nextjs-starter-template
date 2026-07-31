import { z } from "zod"

import { defineNode } from "../node-descriptor"

/**
 * The one node the canvas ships with: a stand-in step that does nothing, so
 * the editor can be exercised end to end (add, connect, configure, compile)
 * before any real trigger or action nodes exist. The node tasks replace the
 * flows built from these; the engine will simply have nothing to execute for
 * them until then.
 */
export const placeholderNode = defineNode({
  kind: "placeholder",
  palette: {
    key: "step-placeholder",
    group: "Steps",
    description: "A stand-in step while real nodes are built",
  },
  createSettings: () => ({ note: "" }),
  settingsSchema: z.object({ note: z.string().max(500) }),
  name: () => "Placeholder step",
  description: (settings) => {
    const note = typeof settings.note === "string" ? settings.note.trim() : ""
    return note || "Does nothing yet — a stand-in while real nodes are built."
  },
  icon: "squareDashed",
  outputPorts: [{ id: "then", label: "Then" }],
  hasInput: true,
  connectionError: () => null,
})
