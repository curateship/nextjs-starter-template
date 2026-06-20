import { EditorState, StateField } from "@codemirror/state"
import type { Extension } from "@codemirror/state"
import { Decoration, EditorView, WidgetType } from "@codemirror/view"
import type { DecorationSet } from "@codemirror/view"

import type { DiffHunk } from "@/app/types"
import { cn } from "@/lib/utils"

const MAX_SPLIT_DIFF_CELLS = 300_000

export const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    backgroundColor: "var(--background)",
    color: "var(--foreground)",
  },
  ".cm-content": { padding: "16px" },
  ".cm-gutters": {
    backgroundColor: "var(--muted)",
    borderRight: "1px solid var(--border)",
    color: "var(--muted-foreground)",
  },
  ".cm-activeLine": {
    backgroundColor: "color-mix(in oklch, var(--muted) 70%, transparent)",
  },
  ".cm-activeLineGutter": { backgroundColor: "var(--muted)" },
  ".cm-original-changed-line": { backgroundColor: "var(--diff-original-bg)" },
  ".cm-current-changed-line": { backgroundColor: "var(--diff-current-bg)" },
})

export type DiffSpacer = {
  count: number
  line: number
}

export type SplitDiffDecorations = {
  currentChangedLines: number[]
  currentSpacers: DiffSpacer[]
  originalChangedLines: number[]
  originalSpacers: DiffSpacer[]
}

export type CodeMirrorTheme = "light" | "dark"

class DiffSpacerWidget extends WidgetType {
  constructor(
    private readonly lineCount: number,
    private readonly className: string
  ) {
    super()
  }

  eq(widget: WidgetType) {
    return (
      widget instanceof DiffSpacerWidget &&
      widget.lineCount === this.lineCount &&
      widget.className === this.className
    )
  }

  toDOM(view: EditorView) {
    const spacer = document.createElement("div")
    spacer.className = cn("cm-diff-spacer", this.className)
    spacer.style.height = `${this.lineCount * view.defaultLineHeight}px`
    spacer.setAttribute("aria-hidden", "true")
    return spacer
  }

  get estimatedHeight() {
    return this.lineCount * 20
  }
}

export function changedLineExtension(
  lines: number[],
  className = "cm-current-changed-line",
  spacers: DiffSpacer[] = [],
  spacerClassName = "cm-current-diff-spacer"
): Extension {
  const changedLines = new Set(lines)
  const lineMark = Decoration.line({ class: className })

  function buildDecorations(state: EditorState) {
    const lineDecorations = Array.from(changedLines)
      .filter((line) => line >= 1 && line <= state.doc.lines)
      .map((line) => lineMark.range(state.doc.line(line).from))
    const spacerDecorations = spacers
      .filter((spacer) => spacer.count > 0)
      .map((spacer) => {
        const atEnd = spacer.line > state.doc.lines
        const position = atEnd
          ? state.doc.line(state.doc.lines).to
          : state.doc.line(Math.max(1, spacer.line)).from
        return Decoration.widget({
          block: true,
          side: atEnd ? 1 : -1,
          widget: new DiffSpacerWidget(spacer.count, spacerClassName),
        }).range(position)
      })

    return Decoration.set([...lineDecorations, ...spacerDecorations], true)
  }

  return StateField.define<DecorationSet>({
    create: buildDecorations,
    update(value, transaction) {
      return transaction.docChanged ? buildDecorations(transaction.state) : value
    },
    provide: (field) => EditorView.decorations.from(field),
  })
}

function splitLines(value: string) {
  return value.split("\n")
}

function lineRange(start: number, count: number) {
  if (start <= 0 || count <= 0) return []
  return Array.from({ length: count }, (_, index) => start + index)
}

export function changedLinesFromHunks(hunks: DiffHunk[]) {
  return hunks.flatMap((hunk) => lineRange(hunk.currentStart, hunk.currentCount))
}

function spacerLine(start: number, count: number) {
  return count > 0 ? start + count : start + 1
}

export function buildSplitDiffDecorationsFromHunks(hunks: DiffHunk[]): SplitDiffDecorations {
  const diff: SplitDiffDecorations = {
    currentChangedLines: [],
    currentSpacers: [],
    originalChangedLines: [],
    originalSpacers: [],
  }

  for (const hunk of hunks) {
    diff.originalChangedLines.push(...lineRange(hunk.originalStart, hunk.originalCount))
    diff.currentChangedLines.push(...lineRange(hunk.currentStart, hunk.currentCount))

    if (hunk.originalCount > hunk.currentCount) {
      diff.currentSpacers.push({
        line: spacerLine(hunk.currentStart, hunk.currentCount),
        count: hunk.originalCount - hunk.currentCount,
      })
    } else if (hunk.currentCount > hunk.originalCount) {
      diff.originalSpacers.push({
        line: spacerLine(hunk.originalStart, hunk.originalCount),
        count: hunk.currentCount - hunk.originalCount,
      })
    }
  }

  return diff
}

export function buildSplitDiffDecorations(
  originalContents: string,
  currentContents: string,
  fallbackCurrentChangedLines: number[] = [],
  diffHunks: DiffHunk[] = []
): SplitDiffDecorations {
  if (diffHunks.length) return buildSplitDiffDecorationsFromHunks(diffHunks)

  const originalLines = splitLines(originalContents)
  const currentLines = splitLines(currentContents)
  let prefix = 0

  while (
    prefix < originalLines.length &&
    prefix < currentLines.length &&
    originalLines[prefix] === currentLines[prefix]
  ) {
    prefix += 1
  }

  let originalEnd = originalLines.length - 1
  let currentEnd = currentLines.length - 1

  while (
    originalEnd >= prefix &&
    currentEnd >= prefix &&
    originalLines[originalEnd] === currentLines[currentEnd]
  ) {
    originalEnd -= 1
    currentEnd -= 1
  }

  const originalMiddle = originalLines.slice(prefix, originalEnd + 1)
  const currentMiddle = currentLines.slice(prefix, currentEnd + 1)

  if (originalMiddle.length * currentMiddle.length > MAX_SPLIT_DIFF_CELLS) {
    return {
      currentChangedLines: fallbackCurrentChangedLines,
      currentSpacers: [],
      originalChangedLines: [],
      originalSpacers: [],
    }
  }

  const lcs = Array.from({ length: originalMiddle.length + 1 }, () =>
    Array(currentMiddle.length + 1).fill(0) as number[]
  )

  for (let originalIndex = originalMiddle.length - 1; originalIndex >= 0; originalIndex -= 1) {
    for (let currentIndex = currentMiddle.length - 1; currentIndex >= 0; currentIndex -= 1) {
      lcs[originalIndex][currentIndex] =
        originalMiddle[originalIndex] === currentMiddle[currentIndex]
          ? lcs[originalIndex + 1][currentIndex + 1] + 1
          : Math.max(lcs[originalIndex + 1][currentIndex], lcs[originalIndex][currentIndex + 1])
    }
  }

  const diff: SplitDiffDecorations = {
    currentChangedLines: [],
    currentSpacers: [],
    originalChangedLines: [],
    originalSpacers: [],
  }
  let originalIndex = 0
  let currentIndex = 0
  let originalLine = prefix + 1
  let currentLine = prefix + 1
  let deletedCount = 0
  let insertedCount = 0

  function flushSpacers() {
    if (deletedCount > insertedCount) {
      diff.currentSpacers.push({ line: currentLine, count: deletedCount - insertedCount })
    } else if (insertedCount > deletedCount) {
      diff.originalSpacers.push({ line: originalLine, count: insertedCount - deletedCount })
    }

    deletedCount = 0
    insertedCount = 0
  }

  while (originalIndex < originalMiddle.length || currentIndex < currentMiddle.length) {
    if (
      originalIndex < originalMiddle.length &&
      currentIndex < currentMiddle.length &&
      originalMiddle[originalIndex] === currentMiddle[currentIndex]
    ) {
      flushSpacers()
      originalIndex += 1
      currentIndex += 1
      originalLine += 1
      currentLine += 1
    } else if (
      currentIndex >= currentMiddle.length ||
      (originalIndex < originalMiddle.length &&
        lcs[originalIndex + 1][currentIndex] >= lcs[originalIndex][currentIndex + 1])
    ) {
      diff.originalChangedLines.push(originalLine)
      deletedCount += 1
      originalIndex += 1
      originalLine += 1
    } else {
      diff.currentChangedLines.push(currentLine)
      insertedCount += 1
      currentIndex += 1
      currentLine += 1
    }
  }

  flushSpacers()
  return diff
}
