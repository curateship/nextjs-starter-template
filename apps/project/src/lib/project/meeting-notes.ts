import type { WrittenPageNode } from "@/lib/pages/written-page-body"
import { linkedTaskOf } from "@/lib/project/notes"

/**
 * A meeting's notes as lines, so each line can become a task. A line is a
 * paragraph or heading at the top of the notes, each item of a list (its
 * first paragraph), and each paragraph of a quote. The server and the screen
 * both cut the notes this way, so a line's place means the same to both.
 *
 * A line made into a task becomes a link to it, keeping the words as they
 * were written: meeting notes record what was said, so a renamed task never
 * rewrites them.
 */
export type NoteLine = {
  /** Where the line's paragraph sits: child indexes from the top of the notes. */
  path: number[]
  text: string
  /** The task the whole line links to, once it was made into one. */
  taskId: string | null
}

export function lineKey(path: readonly number[]) {
  return path.join(".")
}

function lineText(node: WrittenPageNode): string {
  return (node.content ?? [])
    .map((child) => (child.type === "text" ? (child.text ?? "") : child.type === "hardBreak" ? " " : lineText(child)))
    .join("")
    .replace(/\s+/g, " ")
    .trim()
}

function lineTask(node: WrittenPageNode): string | null {
  const texts = (node.content ?? []).filter((child) => child.type === "text" && child.text?.trim())
  if (texts.length === 0) return null
  const ids = texts.map((child) => {
    const link = child.marks?.find((mark) => mark.type === "link")
    return link?.attrs ? linkedTaskOf(link.attrs.href) : null
  })
  return ids[0] && ids.every((taskId) => taskId === ids[0]) ? ids[0] : null
}

function line(node: WrittenPageNode, path: number[]): NoteLine {
  return { path, text: lineText(node), taskId: lineTask(node) }
}

/** Every line of the notes, top to bottom. */
export function noteLines(body: WrittenPageNode): NoteLine[] {
  const lines: NoteLine[] = []
  ;(body.content ?? []).forEach((block, i) => {
    if (block.type === "paragraph" || block.type === "heading") lines.push(line(block, [i]))
    if (block.type === "bulletList" || block.type === "orderedList") {
      ;(block.content ?? []).forEach((item, j) => {
        const first = item.content?.[0]
        if (first?.type === "paragraph") lines.push(line(first, [i, j, 0]))
      })
    }
    if (block.type === "blockquote") {
      ;(block.content ?? []).forEach((child, k) => {
        if (child.type === "paragraph") lines.push(line(child, [i, k]))
      })
    }
  })
  return lines
}

/** The notes with every word of one line linked to `href`, replacing any link it had. */
export function linkLine(body: WrittenPageNode, path: readonly number[], href: string): WrittenPageNode {
  const [index, ...rest] = path
  return {
    ...body,
    content: body.content?.map((child, i) => {
      if (i !== index) return child
      if (rest.length) return linkLine(child, rest, href)
      return {
        ...child,
        content: child.content?.map((piece) =>
          piece.type === "text"
            ? {
                ...piece,
                marks: [...(piece.marks ?? []).filter((mark) => mark.type !== "link"), { type: "link", attrs: { href } }],
              }
            : piece
        ),
      }
    }),
  }
}
