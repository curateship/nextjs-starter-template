import { describe, expect, it } from "vitest"

import type { AutomationGraph } from "@/lib/automations/graph"
import {
  sendEmailDraftSettingsSchema,
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
      settings: {
        subject: "Hello",
        preheader: "Preview",
        fromName: "",
        blocks: [
          {
            id: "message",
            kind: "richText",
            content: {
              htmlContent: "<p>News</p>",
              backgroundColor: "#ffffff",
              padding: 20,
            },
          },
        ],
      },
    },
  ],
  edges: [
    { id: "one", from: "audience", sourcePort: "then", to: "middle" },
    { id: "two", from: "middle", sourcePort: "then", to: "email" },
  ],
  viewport: { x: 0, y: 0, zoom: 1 },
}

describe("Send Email node", () => {
  const valid = sendEmailDraftSettingsSchema.parse(
    graph.nodes.find((node) => node.id === "email")?.settings
  )

  it("requires a one-line subject and at least one block", () => {
    expect(
      sendEmailSettingsSchema.safeParse({ ...valid, subject: "" }).success
    ).toBe(false)
    expect(
      sendEmailSettingsSchema.safeParse({
        ...valid,
        subject: "Hello\nBcc: someone@example.test",
      }).success
    ).toBe(false)
    expect(
      sendEmailSettingsSchema.safeParse({ ...valid, blocks: [] }).success
    ).toBe(false)
  })

  it("refuses a button without a complete safe link", () => {
    expect(
      sendEmailSettingsSchema.safeParse({
        ...valid,
        blocks: [
          {
            id: "button",
            kind: "button",
            content: { label: "Open", url: "javascript:alert(1)" },
          },
        ],
      }).success
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
