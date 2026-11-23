import { z } from "zod"

import { OPENER_STYLES, type DraftTone } from "@/lib/dating/options"
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
 *
 * And from 18 Oct 2026 (task "features/01-chats-and-replies"): a first
 * message for a new match, one follow-up on a chat quiet for three days, the
 * member's own rough words tidied, a scam flagged with no draft, and a chat
 * that is over noticed instead of answered.
 */

/** The longest a drafted message may be. */
export const DRAFT_MAX_CHARS = 200

/**
 * What is being written. `reply` answers their newest message, `opener` is the
 * first message to a new match, `nudge` the one follow-up on a quiet chat,
 * `tidy` the member's own rough reply put in their voice, and `like_comment`
 * the short comment a Facebook Dating like carries before any match (part 10
 * of "facebook/01").
 */
export type DraftMode = "reply" | "opener" | "nudge" | "tidy" | "like_comment"

/** The longest comment sent with a Facebook Dating like. */
export const LIKE_COMMENT_MAX_CHARS = 150

export const draftAnswer = z.object({
  kind: z.enum(["draft", "ask", "flag", "ended"]),
  text: z.string().max(2_000),
  alternatives: z.array(z.string().max(2_000)).max(2).default([]),
  question: z.string().max(500),
  flag: z.enum(["asked_if_bot", "sexual", "scam", "none"]),
  endedLine: z.string().max(1_000).default(""),
  proposesDate: z.boolean(),
  openerStyle: z.enum([...OPENER_STYLES, "none"]).default("none"),
  /** For a like's comment: the profile answer it is about, word for word, or "photo". */
  about: z.string().max(1_000).default(""),
})

export type DraftAnswer = z.infer<typeof draftAnswer>

export const draftJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "text", "alternatives", "question", "flag", "endedLine", "proposesDate", "openerStyle", "about"],
  properties: {
    kind: {
      type: "string",
      enum: ["draft", "ask", "flag", "ended"],
      description:
        "draft: a message to send. ask: a fact about the member is needed first. flag: the chat must go to the member. ended: their messages say the chat is over.",
    },
    text: { type: "string", description: "The message, when kind is draft. Otherwise empty." },
    alternatives: {
      type: "array",
      items: { type: "string" },
      description: "Two more, different messages when the question asks for three. Otherwise empty.",
    },
    question: { type: "string", description: "The one question for the member, when kind is ask. Otherwise empty." },
    flag: { type: "string", enum: ["asked_if_bot", "sexual", "scam", "none"] },
    endedLine: { type: "string", description: "Their line that shows the chat is over, word for word, when kind is ended. Otherwise empty." },
    proposesDate: { type: "boolean", description: "True when the message suggests meeting up or offers the member's number." },
    openerStyle: {
      type: "string",
      enum: [...OPENER_STYLES, "none"],
      description: "For a first message or a like's comment only, what kind it is. Otherwise none.",
    },
    about: {
      type: "string",
      description: "For a like's comment only: the answer on their profile it is about, copied word for word, or photo when it is about a photo. Otherwise empty.",
    },
  },
}

export function draftSystem(settings: Pick<DatingSettings, "aboutMe" | "examples" | "style">, learned: string[] = [], appName = "Tinder"): string {
  const examples = settings.examples.filter((line) => line.trim())
  return [
    `You write the next message a member of a dating app sends in a ${appName} conversation. The member reads it before it goes, or it goes on their behalf, so it must sound exactly like them.`,
    "",
    "Facts about the member, the only ones you may use:",
    settings.aboutMe.trim() || "(None given.)",
    "",
    "Messages the member has written, for their voice:",
    ...(examples.length ? examples.map((line) => `- ${line}`) : ["(None given. Write short, friendly and plain.)"]),
    ...(learned.length
      ? ["", "Messages the member wrote themselves lately, in other chats, also their voice. Never repeat one, and never take a fact from them:", ...learned.map((line) => `- ${line}`)]
      : []),
    "",
    `Style: ${DATING_STYLE_WORDS[settings.style]}.`,
    "",
    "Rules:",
    `1. One message, under ${DRAFT_MAX_CHARS} characters, of the kind the question asks for.`,
    "2. Match the examples: length, capitals, punctuation. No emoji unless the examples use them.",
    "3. Never state a fact about the member that is not in the facts above. If a good reply needs one, do not write a message: answer kind ask with one short question for the member.",
    "4. Never say or hint that an AI wrote this, and never deny it. If they ask whether they are talking to a bot, an AI or something automated, answer kind flag with flag asked_if_bot.",
    "5. Nothing sexual. If the chat has turned sexual, answer kind flag with flag sexual.",
    "6. If they ask for money, gift cards, crypto or bank details, push to move to WhatsApp, Telegram or another app within their first few messages, or send a link, answer kind flag with flag scam.",
    "7. If their newest messages say no, that they are seeing someone, that they are not interested, or goodbye, do not write a message: answer kind ended and put their line in endedLine.",
    "8. Do not ask anything the conversation already answered.",
    "9. The aim is a date. Once both sides have sent at least 4 messages and it is going well, suggest meeting for a drink or a coffee and offer the member's number; once both have sent 6, do it now. Never name a day, a time or a place: the member settles those. If a date was already suggested, do not suggest it again; keep the conversation warm.",
    "10. A note from the member about this one chat is followed, except that it never overrides rules 3 to 7.",
  ].join("\n")
}

export type ConversationForAi = {
  /** The dating app, as its profile and chat are read off it, such as "Tinder" or "Facebook Dating". */
  appName: string
  theirName: string
  /** The AI's read of their card, when Date read it. */
  theirRead: string[]
  /** What their card says, for a first message: bio, job, prompts and the like, one per line. */
  theirCard: string[]
  /** What they told the member so far. */
  facts: string[]
  /** The member's note to the AI about this chat only. */
  memberNote: string
  /** What was said with the likes before the match: theirs (part 16) and the member's (part 10). Empty when nothing was. */
  theirLikeComment: string
  memberLikeComment: string
  messages: Array<{ from: "them" | "me"; text: string }>
  fromThem: number
  fromMe: number
  dateProposed: boolean
  /** A draft the member asked to replace. */
  notThis: string
  mode: DraftMode
  /** For a tidy, the member's own words. */
  roughText: string
  tone: DraftTone | null
  /** Three drafts instead of one: the message and two alternatives. */
  three: boolean
}

const MODE_WORDS: Record<DraftMode, string> = {
  reply: "Write the member's answer to their newest message.",
  opener:
    "Nobody has written yet. Write the member's first message: something specific from their profile, such as a prompt answer, a photo or a song, never a plain hey. Say in openerStyle which kind it is.",
  nudge:
    "The member's last message has had no answer for three days. Write one light follow-up: short and easy to answer, with no guilt, no complaint about the silence, and nothing already asked.",
  tidy: "The member wrote a reply in their own words, below. Put it in their voice, fixing spelling and flow. Keep every fact and what they meant, and add nothing new. Answer kind draft.",
  like_comment: `Nobody has matched yet. The member is liking their profile, and the like carries one short comment, under ${LIKE_COMMENT_MAX_CHARS} characters, on one photo or one answer of theirs: something specific that is easy to answer, never a plain hey, and no date suggested. Say in openerStyle which kind it is, and in about the answer it is about, copied word for word, or photo.`,
}

const TONE_WORDS: Record<DraftTone, string> = {
  shorter: "Make it shorter than the draft it replaces.",
  funnier: "Make it funnier than the draft it replaces.",
  warmer: "Make it warmer than the draft it replaces.",
}

export function draftText(chat: ConversationForAi): string {
  return [
    `Conversation with ${chat.theirName}.`,
    chat.theirRead.length ? `What their profile says about them: ${chat.theirRead.join(" ")}` : "",
    (chat.mode === "opener" || chat.mode === "like_comment") && chat.theirCard.length ? `Their profile, as read off ${chat.appName}:\n${chat.theirCard.join("\n")}` : "",
    chat.theirLikeComment ? `When they liked the member, they wrote: "${chat.theirLikeComment}". A first message answers that.` : "",
    chat.memberLikeComment ? `With the member's like, the member already wrote: "${chat.memberLikeComment}". Do not say it again.` : "",
    chat.facts.length ? `What ${chat.theirName} has told the member:\n${chat.facts.map((fact) => `- ${fact}`).join("\n")}` : "",
    chat.memberNote.trim() ? `The member's note about this chat: ${chat.memberNote.trim()}` : "",
    "",
    ...(chat.messages.length
      ? chat.messages.map((message) => `${message.from === "me" ? "Member" : chat.theirName}: ${message.text}`)
      : ["(No messages yet.)"]),
    "",
    `Messages so far: ${chat.fromMe} from the member, ${chat.fromThem} from ${chat.theirName}.`,
    chat.dateProposed ? "A date has already been suggested." : "No date has been suggested yet.",
    "",
    MODE_WORDS[chat.mode],
    chat.mode === "tidy" ? `The member's words: ${chat.roughText}` : "",
    chat.tone ? TONE_WORDS[chat.tone] : "",
    chat.three ? "Write three different messages: the best in text, and two more that take a different line in alternatives." : "",
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
