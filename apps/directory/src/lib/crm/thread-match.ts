/**
 * Deciding which conversation a new email belongs to.
 *
 * Kept away from the database so the rules can be tested on their own: every
 * function here takes strings and answers strings.
 *
 * The order the rules are tried in is the whole trick, and it is the order a
 * mail client uses:
 *
 * 1. **The headers**, when the sender's client set them. `In-Reply-To` holds
 *    the `Message-ID` of the mail being answered, so a match there is certain.
 * 2. **The same person and the same subject**, within a month. Some clients
 *    send no `In-Reply-To` at all, and a person who writes "Re: your quote"
 *    three weeks later means the same conversation.
 * 3. **A new thread**, when neither of those found anything.
 *
 * Never the subject alone. Two different people both writing "Hello" is two
 * conversations, and merging them would show one person another person's mail.
 */

/** How far back rule 2 will reach for a thread with the same subject. */
const THREAD_MATCH_WINDOW_DAYS = 30

/**
 * The prefixes a mail client puts in front of a subject when it answers or
 * passes something on, in the languages this has run into. Matched without
 * case, with or without the colon's space, and repeatedly — "Re: Fwd: Re:" is
 * one real subject with three prefixes on it.
 */
const REPLY_PREFIX = /^\s*(?:re|fw|fwd|aw|wg|antwort|tr|rv|res|sv|vs|vb)\s*(?:\[\d+\])?\s*:\s*/i

/**
 * The subject with every Re: and Fwd: taken off, squeezed, and lowered.
 *
 * Used only for comparing. What is shown on screen is always the subject the
 * mail actually arrived with.
 */
export function normalizeSubject(subject: string): string {
  let text = subject ?? ""
  // A bounded loop rather than a greedy pattern: "Re: Re: Re: ..." repeated a
  // thousand times by a mail loop must not become a long backtrack.
  for (let pass = 0; pass < 10; pass += 1) {
    const stripped = text.replace(REPLY_PREFIX, "")
    if (stripped === text) break
    text = stripped
  }
  return text.replace(/\s+/g, " ").trim().toLowerCase()
}

/**
 * Every Message-ID in a header, in the order they appear.
 *
 * `In-Reply-To` holds one and `References` holds the whole chain, oldest
 * first, separated by spaces. Both are read the same way. The angle brackets
 * are part of the syntax, not of the id, so they come off.
 *
 * A header with no brackets at all still answers something, because some
 * senders write a bare id, and a bare id matching a stored one is still a
 * match.
 */
export function parseMessageIds(header: string | null | undefined): string[] {
  if (!header) return []

  const bracketed = header.match(/<[^<>\s]+>/g)
  if (bracketed) {
    return bracketed.map((id) => id.slice(1, -1).trim()).filter(Boolean)
  }

  return header
    .split(/[\s,]+/)
    .map((id) => id.trim())
    .filter((id) => id.length > 0 && id.length <= 998)
}

/**
 * The ids worth asking the database about, newest first.
 *
 * `In-Reply-To` is the direct parent so it is asked about first, then the
 * `References` chain from its end backwards, because the end of that chain is
 * the most recent mail in the conversation.
 */
export function threadCandidateIds(
  inReplyTo: string | null | undefined,
  references?: string | null
): string[] {
  const seen = new Set<string>()
  const ordered: string[] = []

  const add = (id: string) => {
    if (seen.has(id)) return
    seen.add(id)
    ordered.push(id)
  }

  for (const id of parseMessageIds(inReplyTo)) add(id)
  for (const id of parseMessageIds(references).reverse()) add(id)

  // Twenty is plenty: a long-running thread's References chain can hold
  // hundreds, and the first match is always near the end.
  return ordered.slice(0, 20)
}

/** The oldest a same-subject thread may be and still be joined. */
export function threadMatchCutoff(at: Date): Date {
  return new Date(at.getTime() - THREAD_MATCH_WINDOW_DAYS * 24 * 60 * 60 * 1000)
}

/**
 * The name to show for a sender, out of whatever the From header held.
 *
 * Mail arrives as `Jane Smith <jane@example.com>`, as `"Smith, Jane"
 * <jane@...>`, or as a bare address. Only the first two have a name in them,
 * and a bare address has none rather than a made-up one.
 */
export function parseFromHeader(from: string): {
  email: string
  name: string | null
} {
  const text = (from ?? "").trim()
  const angled = text.match(/^(.*)<([^<>]+)>\s*$/)

  if (angled) {
    const name = angled[1].trim().replace(/^"(.*)"$/, "$1").trim()
    return { email: angled[2].trim().toLowerCase(), name: name || null }
  }

  return { email: text.toLowerCase(), name: null }
}
