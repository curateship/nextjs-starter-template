import { UserRoundIcon } from "lucide-react"
import { z } from "zod"

import { defineNode } from "../node-descriptor"

/** The member lifecycle changes a flow can begin from. */
export const MEMBER_EVENTS = [
  "registered",
  "verified",
  "subscribed",
  "canceled",
] as const

export type MemberEvent = (typeof MEMBER_EVENTS)[number]

export const MEMBER_EVENT_LABELS: Record<MemberEvent, string> = {
  registered: "Member registered",
  verified: "Email verified",
  subscribed: "Member subscribed",
  canceled: "Member canceled",
}

export const MEMBER_EVENT_HINTS: Record<MemberEvent, string> = {
  registered:
    "Starts once when a member creates their account. Members who already exist are not added later.",
  verified:
    "Starts once when a member confirms that their email address works.",
  subscribed:
    "Starts once when a member begins a paid subscription, including when a lapsed plan becomes active again.",
  canceled:
    "Starts once when a member stops their paid subscription from renewing or ends it immediately.",
}

export function isMemberEventValue(value: unknown): value is MemberEvent {
  return (
    typeof value === "string" &&
    (MEMBER_EVENTS as readonly string[]).includes(value)
  )
}

/** Null keeps unreadable saved settings from starting the wrong flow. */
export function readMemberEvent(
  settings: Record<string, unknown>
): MemberEvent | null {
  return isMemberEventValue(settings.event) ? settings.event : null
}

export function isMemberEvent(event: MemberEvent) {
  return (settings: Record<string, unknown>) =>
    readMemberEvent(settings) === event
}

export const memberEventNode = defineNode({
  kind: "memberEvent",
  palette: {
    key: "trigger-member-event",
    group: "Triggers",
    description:
      "Pick one: a member registers, verifies, subscribes, or cancels",
  },
  createSettings: () => ({ event: "registered" }),
  settingsSchema: z.object({ event: z.enum(MEMBER_EVENTS) }),
  name: (settings) =>
    MEMBER_EVENT_LABELS[readMemberEvent(settings) ?? "registered"],
  description: (settings) => {
    const event = readMemberEvent(settings) ?? "registered"
    return {
      registered: "Starts when a member creates their account.",
      verified: "Starts when a member confirms their email.",
      subscribed: "Starts when a member begins a paid plan.",
      canceled: "Starts when a member cancels their paid plan.",
    }[event]
  },
  icon: UserRoundIcon,
  outputPorts: [{ id: "then", label: "Then" }],
  hasInput: false,
  manualStart: false,
  connectionError: () => null,
  fields: () => import("@/components/automations/nodes/member-event-panel"),
})
