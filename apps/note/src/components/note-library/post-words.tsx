import * as React from "react"
import { HighlighterIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { focusRing } from "@/lib/layout/focus-ring"
import { HIGHLIGHT_CLASS } from "@/lib/note/notes/colours"
import { highlightPieces } from "@/lib/note/library/highlights"
import type { Highlight, HighlightPart } from "@/lib/note/library/highlights"
import { cn } from "@/lib/utils"

/**
 * One part of a post's words (the post, the quoted post, or one post of the
 * thread) with its highlights in yellow. Selecting words inside it brings up
 * a Highlight button; clicking a highlight takes it away. Line breaks are kept
 * as the author wrote them.
 *
 * The offsets are counted in the plain words, which is exactly what the box
 * holds, because each highlight is drawn as a piece of those same words.
 */
export function PostWords({
  text,
  part,
  highlights,
  onHighlight,
  onRemove,
  className,
}: {
  text: string
  part: HighlightPart
  highlights: readonly Highlight[]
  onHighlight?: (highlight: Highlight) => void
  onRemove?: (highlight: Highlight) => void
  className?: string
}) {
  const box = React.useRef<HTMLDivElement>(null)
  const [pending, setPending] = React.useState<{ start: number; end: number } | null>(null)

  // The browser's selection is outside React, so it is listened to here and
  // the picked stretch, when it is inside this box, is kept for the button.
  React.useEffect(() => {
    if (!onHighlight) return
    function onSelectionChange() {
      const element = box.current
      const selection = document.getSelection()
      if (!element || !selection || selection.rangeCount === 0 || selection.isCollapsed) {
        setPending(null)
        return
      }
      const range = selection.getRangeAt(0)
      if (!element.contains(range.startContainer) || !element.contains(range.endContainer)) {
        setPending(null)
        return
      }
      const before = document.createRange()
      before.selectNodeContents(element)
      before.setEnd(range.startContainer, range.startOffset)
      const start = before.toString().length
      const end = start + range.toString().length
      setPending(end > start && text.slice(start, end).trim() ? { start, end } : null)
    }
    document.addEventListener("selectionchange", onSelectionChange)
    return () => document.removeEventListener("selectionchange", onSelectionChange)
  }, [onHighlight, text])

  return (
    <div className={cn("grid grid-cols-[minmax(0,1fr)] gap-2", className)}>
      <div ref={box} className="text-sm leading-relaxed break-words whitespace-pre-wrap">
        {highlightPieces(text, part, highlights).map((piece, index) =>
          piece.highlight && onRemove ? (
            <HighlightPiece key={index} text={piece.text} onRemove={() => onRemove(piece.highlight!)} />
          ) : piece.highlight ? (
            <span key={index} className={HIGHLIGHT_CLASS.yellow}>
              {piece.text}
            </span>
          ) : (
            <React.Fragment key={index}>{piece.text}</React.Fragment>
          )
        )}
      </div>
      {pending && onHighlight ? (
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            // Pressed before the selection is lost to the click, by a mouse,
            // a pen or a finger.
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => {
              onHighlight({ part, start: pending.start, end: pending.end })
              document.getSelection()?.removeAllRanges()
              setPending(null)
            }}
          >
            <HighlighterIcon />
            Highlight
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function HighlightPiece({ text, onRemove }: { text: string; onRemove: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove the highlight on “${text.slice(0, 60)}”`}
          className={cn(HIGHLIGHT_CLASS.yellow, "inline cursor-pointer text-left whitespace-pre-wrap", focusRing)}
        >
          {text}
        </button>
      </TooltipTrigger>
      <TooltipContent>Click to remove the highlight</TooltipContent>
    </Tooltip>
  )
}
