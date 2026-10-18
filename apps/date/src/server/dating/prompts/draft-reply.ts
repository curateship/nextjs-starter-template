import { z } from "zod"

import { DATING_STYLE_WORDS, type DatingSettings } from "@/lib/dating/settings"

/**
 * The AI's next message in one conversation, in the member's voice, aiming
 * for a date. Tyler's rules, 17 Oct 2026, word for word where he gave them:
 *
 * - It never makes up facts about him. A reply that needs one is a question
 *   for him on the dashboard instead.
 * - It never agrees a firm time or place without him.
 * - It never says it is an AI and never denies it. Asked outright, it flags
 *   the chat and stops drafting.
 * - It sends nothing sexual, and flags a chat that turned sexual.
 * - After 4 to 6 messages each way it proposes a drink or coffee and offers
 *   his number.
 */

/** The longest a drafted message may be. */
export const DRAFT_MAX_CHARS = 200

export const draftAnswer = z.object({
  kind: z.enum(["draft", "ask", "flag"]),
  text: z.string().max(2_000),
  question: z.string().max(500),
  flag: z.enum(["asked_if_bot", "sexual", "none"]),
  proposesDate: z.boolean(),
})

export type DraftAnswer = z.infer<typeof draftAnswer>

export const draftJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "text", "question", "flag", "proposesDate"],
  properties: {
    kind: {
      type: "string",
      enum: ["draft", "ask", "flag"],
      description: "draft: a message to send. ask: a fact about the member is needed first. flag: the chat must go to the member.",
    },
    text: { type: "string", description: "The message, when kind is draft. Otherwise empty." },
    question: { type: "string", description: "The one question for the member, when kind is ask. Otherwise empty." },
    flag: { type: "string", enum: ["asked_if_bot", "sexual", "none"] },
    proposesDate: { type: "boolean", description: "True when the message suggests meeting up or offers the member's number." },
  },
}

export function draftSystem(settings: Pick<DatingSettings, "aboutMe" | "examples" | "style">): string {
  const examples = settings.examples.filter((line) => line.trim())
  return [
    "You write the next message a member of a dating app sends in a Tinder conversation. The member reads it before it goes, or it goes on their behalf, so it must sound exactly like them.",
    "",
    "Facts about the member, the only ones you may use:",
    settings.aboutMe.trim() || "(None given.)",
    "",
    "Messages the member has written, for their voice:",
    ...(examples.length ? examples.map((line) => `- ${line}`) : ["(None given. Write short, friendly and plain.)"]),
    "",
    `Style: ${DATING_STYLE_WORDS[settings.style]}.`,
    "",
    "Rules:",
    `1. One message, under ${DRAFT_MAX_CHARS} characters, answering their latest message.`,
    "2. Match the examples: length, capitals, punctuation. No emoji unless the examples use them.",
    "3. Never state a fact about the member that is not in the facts above. If a good reply needs one, do not write a message: answer kind ask with one short question for the member.",
    "4. Never say or hint that an AI wrote this, and never deny it. If they ask whether they are talking to a bot, an AI or something automated, answer kind flag with flag asked_if_bot.",
    "5. Nothing sexual. If the chat has turned sexual, answer kind flag with flag sexual.",
    "6. Do not ask anything the conversation already answered.",
    "7. The aim is a date. Once both sides have sent at least 4 messages and it is going well, suggest meeting for a drink or a coffee and offer the member's number; once both have sent 6, do it now. Never name a day, a time or a place: the member settles those. If a date was already suggested, do not suggest it again; keep the conversation warm.",
  ].join("\n")
}

export type ConversationForAi = {
  theirName: string
  /** The AI's read of their card, when Date read it. */
  theirRead: string[]
  messages: Array<{ from: "them" | "me"; text: string }>
  fromThem: number
  fromMe: number
  dateProposed: boolean
  /** A draft the member asked to replace. */
  notThis: string
}

export function draftText(chat: ConversationForAi): string {
  return [
    `Conversation with ${chat.theirName}.`,
    chat.theirRead.length ? `What their profile says about them: ${chat.theirRead.join(" ")}` : "",
    "",
    ...chat.messages.map((message) => `${message.from === "me" ? "Member" : chat.theirName}: ${message.text}`),
    "",
    `Messages so far: ${chat.fromMe} from the member, ${chat.fromThem} from ${chat.theirName}.`,
    chat.dateProposed ? "A date has already been suggested." : "No date has been suggested yet.",
    chat.notThis ? `\nThe member did not want this draft, so write something different: ${chat.notThis}` : "",
  ]
    .filter((line, index, lines) => line !== "" || lines[index - 1] !== "")
    .join("\n")
}

/** Characters that are emoji, to take out of a draft when the member's examples use none. */
const EMOJI = /\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}]|\u{FE0F}|\u{200D}/gu

export function usesEmoji(text: string): boolean {
  return new RegExp(EMOJI.source, "u").test(text)
}

export function withoutEmoji(text: string): string {
  return text.replace(EMOJI, "").replace(/\s{2,}/g, " ").trim()
}
