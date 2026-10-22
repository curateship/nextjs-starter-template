import { z } from "zod"

/**
 * After new messages from them, one small call reads the chat for three
 * things: what they told the member about themselves (part 2, "What they
 * told you"), once a date was offered whether they said yes and sent a
 * number (part 5, "Dates waiting for you"), and whether they asked for a
 * video or voice call (part 19 of "facebook/01", Tyler's "Flag, no draft").
 * One call for all of it, so a read of a chat costs once.
 */

export const chatNotesAnswer = z.object({
  newFacts: z.array(z.string().max(200)).max(8),
  memberOffered: z.boolean().default(false),
  dateAccepted: z.boolean(),
  acceptedLine: z.string().max(1_000),
  phoneNumber: z.string().max(40),
  askedForCall: z.boolean().default(false),
})

export const chatNotesJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["newFacts", "memberOffered", "dateAccepted", "acceptedLine", "phoneNumber", "askedForCall"],
  properties: {
    newFacts: {
      type: "array",
      items: { type: "string" },
      description: "Up to eight short facts they said about themselves that are not already on the list. Empty when there are none.",
    },
    memberOffered: { type: "boolean", description: "True when the member has offered to meet, such as a drink, a coffee or a walk, in any words." },
    dateAccepted: { type: "boolean", description: "True only when the member offered to meet and they clearly said yes to it." },
    acceptedLine: { type: "string", description: "Their line saying yes, word for word, when dateAccepted. Otherwise empty." },
    phoneNumber: { type: "string", description: "A phone number they sent, exactly as written. Otherwise empty." },
    askedForCall: {
      type: "boolean",
      description: "True when their newest messages ask the member for a video or voice call, in any words. A joke or a mention of calling is not an ask.",
    },
  },
}

export const CHAT_NOTES_SYSTEM = [
  "You read a dating app conversation between a member and someone they matched with, and keep notes for the member.",
  "- Facts: things the other person said about themselves, such as their job, a pet's name, where they grew up or what they are doing this weekend. One short line each, in plain words, like \"Works as a nurse\". Only what they said, never a guess, and nothing about the member.",
  "- Skip any fact already on the list, even worded differently.",
  "- A date: when the member offered a drink, a coffee or to meet, say whether the other person clearly said yes. A maybe, a question back or a change of subject is not a yes.",
  "- A number: only a phone number the other person wrote in the chat, exactly as they wrote it.",
  "- A call: whether their newest messages ask the member for a video or voice call, such as \"want to FaceTime tonight?\". A joke that only mentions calling is not an ask.",
].join("\n")

export function chatNotesText(chat: {
  theirName: string
  facts: string[]
  messages: Array<{ from: "them" | "me"; text: string }>
  dateProposed: boolean
}): string {
  return [
    `Conversation with ${chat.theirName}.`,
    chat.facts.length ? `Facts already on the list:\n${chat.facts.map((fact) => `- ${fact}`).join("\n")}` : "No facts on the list yet.",
    chat.dateProposed ? "The member has offered a date." : "Date has not seen the member offer a date; say in memberOffered whether they did in their own words.",
    "",
    ...chat.messages.map((message) => `${message.from === "me" ? "Member" : chat.theirName}: ${message.text}`),
  ].join("\n")
}

/** A number the AI says they sent counts only when its digits are in one of their own messages, so it is never made up. */
export function numberTheySent(number: string, theirMessages: string[]): string {
  const digits = number.replace(/\D/g, "")
  if (digits.length < 7 || digits.length > 15) return ""
  return theirMessages.some((text) => text.replace(/\D/g, "").includes(digits)) ? number.trim().slice(0, 40) : ""
}
