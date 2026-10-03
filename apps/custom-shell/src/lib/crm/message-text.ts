/**
 * Reading an email's words, wherever they came from.
 *
 * One home for it because three places need the same answers: the inbox row's
 * snippet, the conversation's message card, and the prompt the AI draft is
 * built from. Two copies of HTML stripping is exactly the kind of thing that
 * drifts until one of them stops stripping something.
 */

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
