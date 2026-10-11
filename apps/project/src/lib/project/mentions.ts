/**
 * @ tags in a task's chat. A tag is saved inside the message's words as
 * `@[Leo Park](<user id>)`, so a message keeps who it tagged even after a
 * rename, and the server reads the ids back out to check and tell them.
 * Messages written before tags existed have no tokens and read as before.
 *
 * People never type the token. The box shows "@Leo Park", and `tagPeople`
 * turns each project member's "@Name" into a token on the way out.
 */

const TOKEN = /@\[([^\]\n]{1,120})\]\(([\w-]{1,36})\)/g
const WORD_CHARACTER = /[\p{L}\p{N}_]/u

export type MessagePart =
  | { kind: "text"; text: string }
  | { kind: "tag"; userId: string; name: string }

export function messageParts(body: string): MessagePart[] {
  const parts: MessagePart[] = []
  let last = 0
  for (const match of body.matchAll(TOKEN)) {
    if (match.index > last) parts.push({ kind: "text", text: body.slice(last, match.index) })
    parts.push({ kind: "tag", name: match[1], userId: match[2] })
    last = match.index + match[0].length
  }
  if (last < body.length) parts.push({ kind: "text", text: body.slice(last) })
  return parts
}

/** Everyone a message tags, each once. */
export function taggedUserIds(body: string): string[] {
  return [...new Set([...body.matchAll(TOKEN)].map((match) => match[2]))]
}

/** The message as words, with each tag as "@Name": for a bell notice or the edit box. */
export function messageText(body: string): string {
  return body.replace(TOKEN, (_token, name: string) => `@${name}`)
}

/**
 * Turns each "@Name" of these people into a tag. The longest name wins, so
 * "@Leo Park" is Leo Park and not Leo, and a name must end where a word ends,
 * so "@Alex" never tags Al.
 */
export function tagPeople(text: string, people: readonly { id: string; name: string }[]): string {
  const byLength = [...people]
    .filter((person) => person.name.trim())
    .sort((a, b) => b.name.length - a.name.length)
  let out = ""
  let at = 0
  while (at < text.length) {
    const sign = text.indexOf("@", at)
    if (sign === -1) break
    out += text.slice(at, sign)
    const lower = text.slice(sign + 1).toLowerCase()
    const person = byLength.find((candidate) => {
      const name = candidate.name.toLowerCase()
      if (!lower.startsWith(name)) return false
      const next = lower.charAt(name.length)
      return !next || !WORD_CHARACTER.test(next)
    })
    if (person) {
      out += `@[${person.name.replace(/[\]\n]/g, " ").slice(0, 120)}](${person.id})`
      at = sign + 1 + person.name.length
    } else {
      out += "@"
      at = sign + 1
    }
  }
  return out + text.slice(at)
}

/**
 * What is typed after an @ right before the cursor, or null when the cursor
 * isn't in a tag. Names have spaces, so the words after the @ count until a
 * new line or another @.
 */
export function tagQueryBefore(textBeforeCursor: string): string | null {
  const match = /(?:^|\s)@([^@\n]{0,40})$/.exec(textBeforeCursor)
  return match ? match[1] : null
}
