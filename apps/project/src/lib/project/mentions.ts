/**
 * @ tags and # task links in chat messages. A tag is saved inside the
 * message's words as `@[Leo Park](<user id>)`, so a message keeps who it
 * tagged even after a rename, and the server reads the ids back out to check
 * and tell them. A task link is saved the same way as `#[Fix the contact
 * form](<task id>)`. Messages written before tags existed have no tokens and
 * read as before.
 *
 * People never type a token. The box shows "@Leo Park" and "#Fix the contact
 * form", and `tagPeople` and `linkTasks` turn the ones picked from the lists
 * into tokens on the way out.
 *
 * A link's saved name is never shown as it is. The server swaps it for the
 * task's current title, "a task you can't see" or "deleted task" for each
 * reader (`src/server/project/task-links.ts`), so a title never reaches
 * someone who can't see the task.
 */

const TOKEN = /([@#])\[([^\]\n]{1,200})\]\(([\w-]{1,36})\)/g
const WORD_CHARACTER = /[\p{L}\p{N}_]/u

export type MessagePart =
  | { kind: "text"; text: string }
  | { kind: "tag"; userId: string; name: string }
  | { kind: "link"; taskId: string; name: string }

export function messageParts(body: string): MessagePart[] {
  const parts: MessagePart[] = []
  let last = 0
  for (const match of body.matchAll(TOKEN)) {
    if (match.index > last) parts.push({ kind: "text", text: body.slice(last, match.index) })
    parts.push(
      match[1] === "@"
        ? { kind: "tag", name: match[2], userId: match[3] }
        : { kind: "link", name: match[2], taskId: match[3] }
    )
    last = match.index + match[0].length
  }
  if (last < body.length) parts.push({ kind: "text", text: body.slice(last) })
  return parts
}

function tokenIds(body: string, sign: "@" | "#") {
  return [
    ...new Set(
      [...body.matchAll(TOKEN)].filter((match) => match[1] === sign).map((match) => match[3])
    ),
  ]
}

/**
 * `@project` in a chat tags everyone on the project (Tyler, 13 Oct 2026:
 * anyone may use it). It is saved as a tag like any other, `@[project](project)`,
 * with this id in place of a person's.
 */
export const PROJECT_TAG = { id: "project", name: "project" } as const

/** Everyone a message tags by name, each once. `@project` is read by `tagsWholeProject`. */
export function taggedUserIds(body: string): string[] {
  return tokenIds(body, "@").filter((id) => id !== PROJECT_TAG.id)
}

/** The message tags the whole project with `@project`. */
export function tagsWholeProject(body: string): boolean {
  return tokenIds(body, "@").includes(PROJECT_TAG.id)
}

/** Every task a message links, each once. */
export function linkedTaskIds(body: string): string[] {
  return tokenIds(body, "#")
}

/** The message as words, with each tag as "@Name" and each link as "#Title": for the edit box. */
export function messageText(body: string): string {
  return body.replace(TOKEN, (_token, sign: string, name: string) => `${sign}${name}`)
}

/** Each link's name swapped for what this reader may see (`nameOf`). Tags stay as they are. */
export function renameLinks(body: string, nameOf: (taskId: string) => string): string {
  return body.replace(TOKEN, (token, sign: string, _name: string, targetId: string) =>
    sign === "#" ? `#[${tokenName(nameOf(targetId))}](${targetId})` : token
  )
}

/** A name that fits inside a token: no closing bracket or new line, and never empty. */
function tokenName(name: string) {
  return name.replace(/[\]\n]/g, " ").slice(0, 200).trim() || "task"
}

/**
 * Turns `sign` + each name in `named` into a token. The longest name wins, so
 * "@Leo Park" is Leo Park and not Leo, and a name must end where a word ends,
 * so "@Alex" never tags Al.
 */
function tokenize(text: string, sign: "@" | "#", named: readonly { id: string; name: string }[]) {
  const byLength = [...named]
    .filter((entry) => entry.name.trim())
    .sort((a, b) => b.name.length - a.name.length)
  let out = ""
  let at = 0
  while (at < text.length) {
    const found = text.indexOf(sign, at)
    if (found === -1) break
    out += text.slice(at, found)
    const lower = text.slice(found + 1).toLowerCase()
    const entry = byLength.find((candidate) => {
      const name = candidate.name.toLowerCase()
      if (!lower.startsWith(name)) return false
      const next = lower.charAt(name.length)
      return !next || !WORD_CHARACTER.test(next) || !WORD_CHARACTER.test(name.charAt(name.length - 1))
    })
    if (entry) {
      out += `${sign}[${tokenName(entry.name)}](${entry.id})`
      at = found + 1 + entry.name.length
    } else {
      out += sign
      at = found + 1
    }
  }
  return out + text.slice(at)
}

/** Turns each "@Name" of these people into a tag. */
export function tagPeople(text: string, people: readonly { id: string; name: string }[]): string {
  return tokenize(text, "@", people)
}

/** Turns each "#Title" of these tasks, the ones picked from the # list, into a link. */
export function linkTasks(text: string, tasks: readonly { id: string; title: string }[]): string {
  return tokenize(
    text,
    "#",
    tasks.map((task) => ({ id: task.id, name: task.title }))
  )
}

/** Tags first, then links: the order every message box saves in. */
export function tokenizeMessage(
  text: string,
  people: readonly { id: string; name: string }[],
  tasks: readonly { id: string; title: string }[]
) {
  return linkTasks(tagPeople(text, people), tasks)
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

/** The same for a # task link. Titles are longer than names, so it looks further back. */
export function linkQueryBefore(textBeforeCursor: string): string | null {
  const match = /(?:^|\s)#([^#\n]{0,60})$/.exec(textBeforeCursor)
  return match ? match[1] : null
}
