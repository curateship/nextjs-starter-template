import type { BroadcastBlock } from "@/lib/broadcasts/blocks"

import type { AutomationGraph } from "./graph"

export type AutomationTemplate = {
  key: AutomationTemplateKey
  name: string
  description: string
  steps: readonly string[]
  graph: AutomationGraph
}

export const AUTOMATION_TEMPLATE_KEYS = [
  "welcome-members",
  "changelog-approval",
  "payment-recovery",
] as const

export type AutomationTemplateKey = (typeof AUTOMATION_TEMPLATE_KEYS)[number]

export function isAutomationTemplateKey(
  value: unknown
): value is AutomationTemplateKey {
  return (
    typeof value === "string" &&
    (AUTOMATION_TEMPLATE_KEYS as readonly string[]).includes(value)
  )
}

const emailBlocks = (id: string, htmlContent: string): BroadcastBlock[] => [
  {
    id: `${id}-message`,
    kind: "richText" as const,
    content: { htmlContent, backgroundColor: "#ffffff", padding: 28 },
  },
  {
    id: `${id}-footer`,
    kind: "footer" as const,
    content: {
      companyName: "",
      companyAddress: "",
      alignment: "center" as const,
      showUnsubscribe: true,
    },
  },
]

const edge = (id: string, from: string, to: string) => ({
  id,
  from,
  sourcePort: "then",
  to,
})

/**
 * The small set of flows offered when an automation is created.
 *
 * These deliberately use only steps the shell can run today. Registration,
 * scheduling, cancellation and delay steps each have their own future task;
 * the wording here does not promise those events before those steps exist.
 */
export const AUTOMATION_TEMPLATES: readonly AutomationTemplate[] = [
  {
    key: "welcome-members",
    name: "Welcome confirmed members",
    description:
      "Send a warm welcome to every confirmed member when you run the flow.",
    steps: ["Confirmed members", "Welcome email"],
    graph: {
      nodes: [
        {
          id: "welcome-audience",
          kind: "audience",
          x: 80,
          y: 120,
          settings: {
            audience: "registered",
            planSlug: "",
            segmentId: "",
            segmentName: "",
            tag: "",
          },
        },
        {
          id: "welcome-email",
          kind: "sendEmail",
          x: 380,
          y: 120,
          settings: {
            subject: "Welcome — we’re glad you’re here",
            preheader: "A quick hello and what to expect next.",
            fromName: "",
            blocks: emailBlocks(
              "welcome",
              "<h2>Welcome!</h2><p>Thanks for joining us. We’re glad you’re here.</p><p>We’ll keep you posted with the things worth knowing.</p>"
            ),
          },
        },
      ],
      edges: [edge("welcome-to-email", "welcome-audience", "welcome-email")],
      viewport: { x: 0, y: 0, zoom: 0.9 },
    },
  },
  {
    key: "changelog-approval",
    name: "Changelog email with approval",
    description:
      "Prepare a changelog for the whole contact list and wait for approval before sending.",
    steps: ["Everyone", "Approval", "Changelog email"],
    graph: {
      nodes: [
        {
          id: "changelog-audience",
          kind: "audience",
          x: 40,
          y: 120,
          settings: {
            audience: "everyone",
            planSlug: "",
            segmentId: "",
            segmentName: "",
            tag: "",
          },
        },
        {
          id: "changelog-approval",
          kind: "waitForApproval",
          x: 340,
          y: 120,
          settings: {
            summary:
              "Send this changelog email to everyone on the contact list.",
            timeoutDays: 3,
          },
        },
        {
          id: "changelog-email",
          kind: "sendEmail",
          x: 640,
          y: 120,
          settings: {
            subject: "What’s new this week",
            preheader: "The latest improvements, all in one place.",
            fromName: "",
            blocks: emailBlocks(
              "changelog",
              "<h2>What’s new</h2><p>Here’s a quick look at what improved this week.</p><ul><li>Add your first update here.</li><li>Add another useful change here.</li></ul>"
            ),
          },
        },
      ],
      edges: [
        edge(
          "changelog-to-approval",
          "changelog-audience",
          "changelog-approval"
        ),
        edge("approval-to-email", "changelog-approval", "changelog-email"),
      ],
      viewport: { x: 0, y: 0, zoom: 0.9 },
    },
  },
  {
    key: "payment-recovery",
    name: "Payment failure follow-up",
    description:
      "Follow up with a member when Stripe reports that their payment failed.",
    steps: ["Payment failed", "Recovery email"],
    graph: {
      nodes: [
        {
          id: "payment-failed",
          kind: "billingMoment",
          x: 80,
          y: 120,
          settings: { moment: "paymentFailed", daysBefore: 3 },
        },
        {
          id: "payment-email",
          kind: "sendEmail",
          x: 380,
          y: 120,
          settings: {
            subject: "We couldn’t process your payment",
            preheader:
              "Please check your payment details to keep your plan active.",
            fromName: "",
            blocks: emailBlocks(
              "payment",
              "<h2>There was a problem with your payment</h2><p>We couldn’t process your latest payment. Please check your payment details so your plan can continue without interruption.</p>"
            ),
          },
        },
      ],
      edges: [edge("payment-to-email", "payment-failed", "payment-email")],
      viewport: { x: 0, y: 0, zoom: 0.9 },
    },
  },
]

export function automationTemplate(
  key: AutomationTemplateKey
): AutomationTemplate {
  const template = AUTOMATION_TEMPLATES.find((item) => item.key === key)
  if (!template) throw new Error("TEMPLATE_NOT_FOUND")
  return template
}
