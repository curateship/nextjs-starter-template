/**
 * Reading an email's words, wherever they came from, and writing the quote
 * that carries them into a reply.
 *
 * One home for it because three places need the same answers: the inbox row's
 * snippet, the conversation's message card, and the prompt the AI draft is
 * built from. Two copies of HTML stripping is exactly the kind of thing that
 * drifts until one of them stops stripping something.
 *
 * Both directions live here on purpose. `splitQuotedText` finds the fold in
 * mail coming in, and `quoteAsText` writes a fold on the way out. They have to
 * agree on what a quote looks like, and they can only be kept in step while
 * they are in front of each other.
 */

import { escapeHtml } from "@/lib/email/escape-html"
import { formatDateTime } from "@/lib/format/format-time"

/** How much of a message an inbox row shows. */
const SNIPPET_LENGTH = 160

/**
 * HTML read as words.
 *
 * Crude, and that is the point: the alternative is putting a stranger's markup
 * into the page. Mail that is HTML only still has to be readable, and losing
 * its bold is a much smaller problem than running its script.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    // Spaces squeezed per line, so the blank lines between paragraphs survive.
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/**
 * Where the quoted history starts, so it can be folded away.
 *
 * Two markers cover almost every client: a line beginning with `>`, and the
 * "On <date> <someone> wrote:" line Gmail and Outlook both write. Nothing is
 * thrown away — what is below the fold is still there behind the button.
 *
 * A message that is nothing BUT quoted text keeps all of it as its own words,
 * because folding everything away would leave a card with nothing in it.
 */
export function splitQuotedText(body: string): {
  own: string
  quoted: string | null
} {
  const lines = body.replace(/\r\n/g, "\n").split("\n")

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const isQuoteStart = /^\s*>/.test(line) || /^\s*On .+wrote:\s*$/.test(line)
    if (!isQuoteStart) continue

    // The blank line above the marker belongs to the fold, not to the words.
    const end = index > 0 && lines[index - 1].trim() === "" ? index - 1 : index
    const own = lines.slice(0, end).join("\n").trim()
    const quoted = lines.slice(end).join("\n").trim()
    // Nothing of their own above the quote: keep the lot rather than fold it
    // all away.
    if (!own) break
    return { own, quoted: quoted || null }
  }

  return { own: body.trim(), quoted: null }
}

/**
 * The start of a message, for a row in a list.
 *
 * Plain text when there is any, the HTML read as words when there is not, and
 * null when there is neither — which is a message whose body has not arrived
 * yet, and the row says so rather than showing an empty line.
 *
 * Quoted history is left out: it is the previous email, not this one, and a
 * one-line reply under three paragraphs of quoting would otherwise show the
 * quoting.
 */
export function messageSnippet(
  textBody: string | null,
  htmlBody: string | null
): string | null {
  const source = textBody?.trim()
    ? textBody
    : htmlBody
      ? htmlToText(htmlBody)
      : null
  if (!source) return null

  const squeezed = splitQuotedText(source)
    .own.replace(/\s+/g, " ")
    .trim()
  if (!squeezed) return null

  return squeezed.length > SNIPPET_LENGTH
    ? `${squeezed.slice(0, SNIPPET_LENGTH).trimEnd()}…`
    : squeezed
}

/** The newest message in a conversation, as the quote below a reply needs it. */
export type QuotableMessage = {
  fromName: string | null
  fromEmail: string
  textBody: string | null
  htmlBody: string | null
  occurredAt: Date | string | null
}

/** The message a reply is answering, spelled for the mail it goes into. */
export type QuotedMessage = {
  /** "On Oct 2, 2026, 3:07 PM, Jane Smith wrote:" */
  attribution: string
  /** Their words, as text, with their own quoted history still in them. */
  body: string
}

/**
 * The message a reply is answering, ready to go under the typed words.
 *
 * Null when there is nothing to quote: a message whose body has not arrived
 * yet, or one whose body turned out to be empty. A reply then carries the
 * typed words alone rather than an attribution line with nothing under it.
 *
 * Their own quoted history is kept rather than trimmed. If their mail already
 * held three levels of quoting, that is what they sent and what they get back,
 * and their client folds it the same way ours does.
 */
export function quotedMessage(
  message: QuotableMessage
): QuotedMessage | null {
  // No date, no attribution line worth writing: "On —, Jane wrote:" is worse
  // than quoting nothing. Every stored message has one, so this is a guard
  // rather than a case anybody meets.
  if (!message.occurredAt) return null

  const source = message.textBody?.trim()
    ? message.textBody
    : message.htmlBody
      ? htmlToText(message.htmlBody)
      : null
  const body = source?.replace(/\r\n/g, "\n").trim()
  if (!body) return null

  // "On Oct 2, 2026, 3:07 PM, Jane Smith wrote:" — the line Gmail and Outlook
  // both write, and the one `splitQuotedText` above looks for. Our own quote
  // has to match it, or a reply to our reply would not fold.
  const who = message.fromName?.trim() || message.fromEmail
  const when = formatDateTime(message.occurredAt)
  return { attribution: `On ${when}, ${who} wrote:`, body }
}

/**
 * A quote as plain text: the attribution line, then every line behind `> `.
 *
 * `> ` on a blank line too, which is what mail clients write and what keeps
 * the quoted block looking like one block rather than two.
 */
export function quoteAsText(quote: QuotedMessage): string {
  const quoted = quote.body
    .split("\n")
    .map((line) => `> ${line}`.trimEnd())
    .join("\n")
  return `${quote.attribution}\n${quoted}`
}

/**
 * A quote as HTML: the attribution line, then the words inside a block with a
 * line down its left.
 *
 * The border is what every mail client draws for a quote, and the escaping is
 * the same as everywhere else here, because this is somebody else's typing
 * going into our markup.
 */
export function quoteAsHtml(quote: QuotedMessage): string {
  const lines = escapeHtml(quote.body).replace(/\n/g, "<br />")
  return (
    `<p style="margin:24px 0 8px;color:#555">${escapeHtml(quote.attribution)}</p>` +
    `<blockquote style="margin:0;padding:0 0 0 12px;border-left:2px solid #d4d4d4;color:#555">` +
    `<p style="margin:0">${lines}</p></blockquote>`
  )
}
