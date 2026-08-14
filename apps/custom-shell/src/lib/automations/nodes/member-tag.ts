import { TagIcon } from "lucide-react"
import { z } from "zod"

import {
  MEMBER_TAG_MAX_LENGTH,
  MEMBER_TAG_SEPARATOR,
  normalizeMemberTag,
} from "@/lib/member-tags"

import { defineNode } from "../node-descriptor"

export const MEMBER_TAG_MODES = ["add", "remove"] as const
export type MemberTagMode = (typeof MEMBER_TAG_MODES)[number]

export function memberTagWording(mode: MemberTagMode, tag: string): string {
  const verb = mode === "add" ? "Add" : "Remove"
  return tag ? `${verb} the “${tag}” tag` : `${verb} a tag not chosen yet`
}

export const memberTagNode = defineNode({
  kind: "memberTag",
  palette: {
    key: "action-member-tag",
    group: "Actions",
    description: "Add or remove a tag on the flow's member",
  },
  createSettings: () => ({ mode: "add", tag: "" }),
  settingsSchema: z.object({
    mode: z.enum(MEMBER_TAG_MODES),
    tag: z
      .string()
      .trim()
      .min(1, "Enter the tag this step should change.")
      .max(
        MEMBER_TAG_MAX_LENGTH,
        `Keep the tag to ${MEMBER_TAG_MAX_LENGTH} characters or fewer.`
      )
      .refine((tag) => !tag.includes(MEMBER_TAG_SEPARATOR), {
        message: "A member tag cannot contain a comma.",
      })
      .transform(normalizeMemberTag),
  }),
  name: () => "Member tag",
  description: (settings) => {
    const mode = MEMBER_TAG_MODES.includes(settings.mode as MemberTagMode)
      ? (settings.mode as MemberTagMode)
      : "add"
    const tag =
      typeof settings.tag === "string" ? normalizeMemberTag(settings.tag) : ""
    return memberTagWording(mode, tag)
  },
  icon: TagIcon,
  outputPorts: [{ id: "then", label: "Then" }],
  hasInput: true,
  manualStart: false,
  connectionError: () => null,
  fields: () => import("@/components/automations/nodes/member-tag-panel"),
})
