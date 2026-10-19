import { z } from "zod"

/**
 * The brief before a date (part 13): three lines from the chat worth
 * remembering before meeting, picked once when the date is agreed.
 */

export const dateBriefAnswer = z.object({ lines: z.array(z.string().max(300)).max(3) })

export const dateBriefJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["lines"],
  properties: {
    lines: {
      type: "array",
      items: { type: "string" },
      description: "Three short lines, each one thing from the chat worth remembering before the date.",
    },
  },
}

export const DATE_BRIEF_SYSTEM = [
  "A member of a dating app is about to meet someone they matched with. From the conversation, pick the three things most worth remembering before the date: a joke you share, something they are looking forward to, a question left open.",
  "- One short line each, in plain words, about the other person or the chat.",
  "- Only what the chat says. Never a guess.",
].join("\n")

export function dateBriefText(chat: { theirName: string; messages: Array<{ from: "them" | "me"; text: string }> }): string {
  return [
    `Conversation with ${chat.theirName}.`,
    "",
    ...chat.messages.map((message) => `${message.from === "me" ? "Member" : chat.theirName}: ${message.text}`),
  ].join("\n")
}
