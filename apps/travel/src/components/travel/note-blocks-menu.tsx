import * as React from "react"
import { createPortal } from "react-dom"

import { NoteCardPicker } from "@/components/travel/note-card-picker"
import type { NoteBlocks } from "@/components/travel/use-note-blocks"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

/** A point on the page for the list to hang from: the "/" just typed. */
const CaretAnchor = React.forwardRef<HTMLSpanElement, { x: number; y: number }>(function CaretAnchor({ x, y, ...props }, ref) {
  return createPortal(
    <span ref={ref} aria-hidden {...props} className="pointer-events-none fixed size-0" style={{ left: x, top: y }} />,
    document.body
  )
})

/**
 * The list "/" opens in a Travel note (Travel features 3, part 1), and the
 * card picker that Place and Map open from it. The cursor stays in the note:
 * the arrow keys move through the list, Enter or a click picks, and Esc or a
 * click away closes it, leaving the "/" as typed.
 */
export function NoteBlocksMenu({ blocks }: { blocks: NoteBlocks }) {
  const { open, items, active } = blocks
  return (
    <>
      {/* Only while open: the anchor lives on the page body, which a page drawn on the server doesn't have. */}
      {open ? (
        <Popover open modal={false} onOpenChange={(next) => (next ? undefined : blocks.close())}>
          <PopoverTrigger asChild>
            <CaretAnchor x={open.x} y={open.y} />
          </PopoverTrigger>
          <PopoverContent
            align="start"
            aria-label="Blocks"
            className="w-max min-w-56 gap-0 p-2 text-[13px]"
            onOpenAutoFocus={(event) => event.preventDefault()}
            onCloseAutoFocus={(event) => event.preventDefault()}
            // The cursor lives in the note, outside the list, so focus there isn't leaving it. Leaving the
            // note closes the list through the editor's own blur (`note-slash.ts`); a click elsewhere still does.
            onFocusOutside={(event) => event.preventDefault()}
          >
            <div role="listbox" aria-label="Blocks" className="grid">
              {items.map((item, index) => {
                const Icon = item.icon
                return (
                  <button
                    key={item.key}
                    type="button"
                    role="option"
                    aria-selected={index === active}
                    className={cn(
                      "flex min-h-8 items-center gap-2 rounded-md px-2.5 py-1.5 text-left hover:bg-accent",
                      index === active && "bg-accent"
                    )}
                    // Pressing the list must not take the cursor out of the note.
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => blocks.setActive(index)}
                    onClick={() => blocks.choose(item.key)}
                  >
                    <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="grid">
                      <span>{item.label}</span>
                      <span className="text-xs text-muted-foreground">{item.hint}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </PopoverContent>
        </Popover>
      ) : null}
      <NoteCardPicker
        open={blocks.picking !== null}
        mode={blocks.picking?.mode ?? "place"}
        onClose={blocks.cancelPicking}
        onPick={blocks.placePicked}
      />
    </>
  )
}
