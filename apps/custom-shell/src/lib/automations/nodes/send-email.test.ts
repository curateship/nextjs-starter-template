import { describe, expect, it } from "vitest"

import type { AutomationGraph } from "@/lib/automations/graph"
import {
  sendEmailAudienceWording,
  sendEmailSettingsSchema,
  upstreamAudienceNode,
} from "@/lib/automations/nodes/send-email"

const graph: AutomationGraph = {
  nodes: [
    {
      id: "audience",
      kind: "audience",
      x: 0,
      y: 0,
      settings: {
        audience: "plan",
        planSlug: "pro",
        segmentId: "",
        segmentName: "",
      },
    },
    {
      id: "middle",
      kind: "placeholder",
      x: 0,
      y: 0,
      settings: { note: "" },
    },
    {
      id: "email",
      kind: "sendEmail",
      x: 0,
      y: 0,
      settings: { subject: "Hello", body: "News" },
    },
  ],
  edges: [
    { id: "one", from: "audience", sourcePort: "then", to: "middle" },
    { id: "two", from: "middle", sourcePort: "then", to: "email" },
  ],
  viewport: { x: 0, y: 0, zoom: 1 },
}

describe("Send Email node", () => {
  it("requires a one-line subject and a message", () => {
    expect(
      sendEmailSettingsSchema.safeParse({ subject: "", body: "News" }).success
    ).toBe(false)
    expect(
      sendEmailSettingsSchema.safeParse({
        subject: "Hello\nBcc: someone@example.test",
        body: "News",
      }).success
    ).toBe(false)
    expect(
      sendEmailSettingsSchema.safeParse({ subject: "Hello", body: "   " })
        .success
    ).toBe(false)
  })

  it("names the closest Audience step feeding the email", () => {
    expect(upstreamAudienceNode(graph, "email")?.id).toBe("audience")
    expect(sendEmailAudienceWording(graph, "email")).toBe(
      'Members paying for the "pro" plan.'
    )
  })

  it("explains the subject-member fallback when no Audience step comes first", () => {
    expect(sendEmailAudienceWording(graph, "audience")).toContain(
      "The member this run is about"
    )
  })
})
