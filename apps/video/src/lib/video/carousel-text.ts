import type {
  CarouselTextMark,
  CarouselTextMarkStyle,
  CarouselWordsItem,
} from "@/lib/video/carousel-schema"

/**
 * How carousel words are laid out: where lines break, which words are bold
 * or highlighted, and the numbers the canvas and the export both draw with
 * (workspace/docs/carousel-text-styles.md).
 */

/** Times the font size from one line to the next, unless a layer says. */
export const CAROUSEL_TEXT_LINE_HEIGHT = 1.16

/** Highlighted words sit on this colour unless the layer picks another. */
export const DEFAULT_HIGHLIGHT_COLOR = "#ffe27a"

/**
 * Bold is drawn as a line round each letter in the letter's own colour, this
 * share of the font size wide. Every face ships at one weight, so a second,
 * bolder file per face is not needed and the export matches the canvas.
 */
export const BOLD_STROKE_EM = 0.045

/** How far a highlight's box reaches past its words on each side. */
export const HIGHLIGHT_SPREAD_EM = 0.08

export function lineHeightOf(item: Pick<CarouselWordsItem, "lineHeight">) {
  return item.lineHeight ?? CAROUSEL_TEXT_LINE_HEIGHT
}

export function letterSpacingOf(
  item: Pick<CarouselWordsItem, "letterSpacing">
) {
  return item.letterSpacing ?? 0
}

/**
 * Where a line's words sit, measured down from the top of the line, as a
 * share of the font size. A browser centres the face's height on each line,
 * and the export does the same so the two agree at any line spacing.
 */
export function baselineEm(
  font: { ascent: number; descent: number },
  lineHeight: number
) {
  return (lineHeight - font.ascent - font.descent) / 2 + font.ascent
}

/** What a slide-number layer says on the slide at `index` of `count`. */
export function slideNumberText(index: number, count: number) {
  return `${index + 1}/${count}`
}

/** A stretch of words drawn the same way. */
export type TextRun = { text: string; bold: boolean; highlight: boolean }

function styleAt(marks: readonly CarouselTextMark[], index: number) {
  let bold = false
  let highlight = false
  for (const mark of marks) {
    if (index < mark.start || index >= mark.end) continue
    if (mark.style === "bold") bold = true
    else highlight = true
  }
  return { bold, highlight }
}

function pushRun(runs: TextRun[], run: TextRun) {
  const last = runs[runs.length - 1]
  if (last && last.bold === run.bold && last.highlight === run.highlight) {
    last.text += run.text
  } else {
    runs.push({ ...run })
  }
}

/**
 * The text cut wherever its look changes, every character kept as typed.
 * The canvas draws these as spans and lets the browser wrap them.
 */
export function markRuns(
  text: string,
  marks: readonly CarouselTextMark[] = []
): TextRun[] {
  const runs: TextRun[] = []
  for (let index = 0; index < text.length; index += 1) {
    pushRun(runs, { text: text[index], ...styleAt(marks, index) })
  }
  return runs
}

/** How wide some words are, in the same units as the box's width. */
export type MeasureWords = (words: string) => number

/** A guess at width from the face's average letter: letters × size × ratio. */
export function byLetterCount(fontSize: number, letterWidth: number): MeasureWords {
  return (words) => words.length * fontSize * letterWidth
}

/**
 * The lines the export draws, as runs. Spaces between words collapse to one
 * and each paragraph starts a new line. A line takes words while `measure`
 * says they still fit `width`, and a word wider than a line is cut where it
 * stops fitting. A space between two words keeps a highlight only when both
 * sides have it.
 */
export function wrapCarouselRuns(
  text: string,
  marks: readonly CarouselTextMark[],
  width: number,
  measure: MeasureWords
): TextRun[][] {
  const fits = (words: string) => measure(words) <= width
  const lines: TextRun[][] = []
  let offset = 0
  for (const paragraph of text.split("\n")) {
    const words = [...paragraph.matchAll(/\S+/g)].map((match) => ({
      text: match[0],
      start: offset + (match.index ?? 0),
    }))
    offset += paragraph.length + 1
    if (!words.length) {
      lines.push([])
      continue
    }
    // Long words are cut into pieces that each fill a line, at least one
    // letter each.
    const pieces = words.flatMap((word) => {
      if (fits(word.text)) return [{ ...word, whole: true }]
      const cut: { text: string; start: number; whole: boolean }[] = []
      let from = 0
      while (from < word.text.length) {
        let to = from + 1
        while (to < word.text.length && fits(word.text.slice(from, to + 1))) {
          to += 1
        }
        cut.push({
          text: word.text.slice(from, to),
          start: word.start + from,
          whole: false,
        })
        from = to
      }
      return cut
    })
    let line: typeof pieces = []
    const flush = () => {
      lines.push(lineRuns(line, marks))
      line = []
    }
    for (const piece of pieces) {
      if (!piece.whole) {
        if (line.length) flush()
        line = [piece]
        flush()
        continue
      }
      const joined = [...line, piece].map((word) => word.text).join(" ")
      if (line.length && !fits(joined)) flush()
      line.push(piece)
    }
    if (line.length) flush()
  }
  return lines
}

function lineRuns(
  words: { text: string; start: number }[],
  marks: readonly CarouselTextMark[]
) {
  const runs: TextRun[] = []
  words.forEach((word, index) => {
    if (index > 0) {
      const before = styleAt(marks, word.start - 1)
      const after = styleAt(marks, word.start)
      pushRun(runs, {
        text: " ",
        bold: before.bold && after.bold,
        highlight: before.highlight && after.highlight,
      })
    }
    for (let character = 0; character < word.text.length; character += 1) {
      pushRun(runs, {
        text: word.text[character],
        ...styleAt(marks, word.start + character),
      })
    }
  })
  return runs
}

/** The lines as plain words, for counting how many there are. */
export function wrapCarouselText(
  text: string,
  width: number,
  fontSize: number,
  letterWidth: number
) {
  return wrapCarouselRuns(
    text,
    [],
    width,
    byLetterCount(fontSize, letterWidth)
  ).map((line) => line.map((run) => run.text).join(""))
}

/** Sorted, with touching or overlapping marks of one style joined. */
function normalizeMarks(marks: readonly CarouselTextMark[]) {
  const joined: CarouselTextMark[] = []
  const sorted = [...marks]
    .filter((mark) => mark.end > mark.start)
    .sort((a, b) =>
      a.style === b.style ? a.start - b.start : a.style < b.style ? -1 : 1
    )
  for (const mark of sorted) {
    const last = joined[joined.length - 1]
    if (last && last.style === mark.style && mark.start <= last.end) {
      last.end = Math.max(last.end, mark.end)
    } else {
      joined.push({ ...mark })
    }
  }
  return joined.sort((a, b) => a.start - b.start || (a.style < b.style ? -1 : 1))
}

/**
 * Bold or Highlight pressed with letters `start` to `end` selected: the style
 * comes off when every one of them already has it, and goes on otherwise.
 */
export function toggleMark(
  marks: readonly CarouselTextMark[] = [],
  start: number,
  end: number,
  style: CarouselTextMarkStyle
): CarouselTextMark[] {
  if (end <= start) return [...marks]
  const covered = Array.from({ length: end - start }, (_, i) => start + i).every(
    (index) =>
      marks.some(
        (mark) => mark.style === style && index >= mark.start && index < mark.end
      )
  )
  if (!covered) return normalizeMarks([...marks, { start, end, style }])
  return normalizeMarks(
    marks.flatMap((mark) => {
      if (mark.style !== style || mark.end <= start || mark.start >= end) {
        return [mark]
      }
      return [
        { ...mark, end: start },
        { ...mark, start: end },
      ].filter((part) => part.end > part.start)
    })
  )
}

/** True when every letter from `start` to `end` already has `style`. */
export function hasMark(
  marks: readonly CarouselTextMark[] = [],
  start: number,
  end: number,
  style: CarouselTextMarkStyle
) {
  if (end <= start) return false
  return Array.from({ length: end - start }, (_, i) => start + i).every(
    (index) =>
      marks.some(
        (mark) => mark.style === style && index >= mark.start && index < mark.end
      )
  )
}

/**
 * Marks moved to follow an edit from `before` to `after`, found by the
 * stretch that changed between them. Letters typed inside a marked word take
 * its style; marked letters that were deleted take their mark with them.
 */
export function shiftMarks(
  before: string,
  after: string,
  marks: readonly CarouselTextMark[] = []
): CarouselTextMark[] {
  if (before === after || !marks.length) return [...marks]
  let prefix = 0
  const shorter = Math.min(before.length, after.length)
  while (prefix < shorter && before[prefix] === after[prefix]) prefix += 1
  let suffix = 0
  while (
    suffix < shorter - prefix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) {
    suffix += 1
  }
  const beforeEnd = before.length - suffix
  const afterEnd = after.length - suffix
  const delta = after.length - before.length

  // A mark's start checks "after the change" first, so letters typed right in
  // front of a marked word move it along instead of joining it.
  const moveStart = (index: number) =>
    index >= beforeEnd ? index + delta : index <= prefix ? index : afterEnd
  const moveEnd = (index: number) =>
    index <= prefix ? index : index >= beforeEnd ? index + delta : prefix

  return normalizeMarks(
    marks
      .map((mark) => ({
        ...mark,
        start: Math.min(after.length, moveStart(mark.start)),
        end: Math.min(after.length, moveEnd(mark.end)),
      }))
      .filter((mark) => mark.end > mark.start)
  )
}
