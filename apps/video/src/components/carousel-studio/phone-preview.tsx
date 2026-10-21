import * as React from "react"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

import { StaticSlidePreview } from "@/components/carousel-studio/slide-layer"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { CarouselFormat, CarouselSlide } from "@/lib/video/carousel-schema"
import { cn } from "@/lib/utils"

// A swipe that travels this share of the slide's width moves on a slide.
const SWIPE_SHARE = 0.18

/**
 * The carousel as Instagram shows it on a phone: one slide at a time, swiped
 * or stepped with the arrows, with the place shown top right and dots under
 * the slide, then the caption (workspace/docs/carousel-preview.md).
 */
export function PhonePreviewDialog({
  open,
  onOpenChange,
  slides,
  caption,
  format,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  slides: CarouselSlide[]
  caption: string
  format: CarouselFormat
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin" className="max-w-md">
        <DialogHeader>
          <DialogTitle>Preview</DialogTitle>
          <DialogDescription>
            Swipe or use the arrow keys to go through the slides as they show on
            a phone.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {open ? (
            <PhoneFrame slides={slides} caption={caption} format={format} />
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PhoneFrame({
  slides,
  caption,
  format,
}: {
  slides: CarouselSlide[]
  caption: string
  format: CarouselFormat
}) {
  const [current, setCurrent] = React.useState(0)
  // How far the finger has dragged the slides, or null while not dragging.
  const [dragX, setDragX] = React.useState<number | null>(null)
  const dragRef = React.useRef<{ startX: number; width: number } | null>(null)
  const last = slides.length - 1
  const index = Math.min(current, last)

  function go(next: number) {
    setCurrent(Math.max(0, Math.min(last, next)))
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    dragRef.current = {
      startX: event.clientX,
      width: event.currentTarget.clientWidth,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragX(0)
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag) return
    let dx = event.clientX - drag.startX
    // Past the first or last slide the swipe drags with a pull, as a phone's.
    if ((index === 0 && dx > 0) || (index === last && dx < 0)) dx /= 3
    setDragX(dx)
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    dragRef.current = null
    if (!drag) return
    event.currentTarget.releasePointerCapture(event.pointerId)
    const dx = event.clientX - drag.startX
    if (Math.abs(dx) > drag.width * SWIPE_SHARE) go(index + (dx < 0 ? 1 : -1))
    setDragX(null)
  }

  return (
    <div
      className="mx-auto grid w-full max-w-[360px] gap-3 rounded-[28px] border bg-background p-3"
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") {
          event.preventDefault()
          go(index + 1)
        } else if (event.key === "ArrowLeft") {
          event.preventDefault()
          go(index - 1)
        }
      }}
    >
      <div className="relative overflow-hidden rounded-md">
        <div
          role="group"
          aria-roledescription="carousel"
          aria-label={`Slide ${index + 1} of ${slides.length}`}
          tabIndex={0}
          data-preview-track
          className="flex touch-pan-y outline-none select-none focus-visible:ring-2 focus-visible:ring-ring"
          style={{
            transform: `translateX(calc(${-index * 100}% + ${dragX ?? 0}px))`,
            transition: dragX === null ? "transform 0.25s ease" : "none",
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {slides.map((slide, slideIndex) => (
            <div
              key={slide.id}
              className="w-full flex-none"
              aria-hidden={slideIndex !== index}
            >
              <StaticSlidePreview
                slide={slide}
                format={format}
                index={slideIndex}
                count={slides.length}
                play={slideIndex === index}
              />
            </div>
          ))}
        </div>
        <span
          data-preview-place
          className="pointer-events-none absolute top-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-xs font-medium text-white tabular-nums"
        >
          {index + 1}/{slides.length}
        </span>
        {index > 0 ? (
          <PhoneArrow side="left" onClick={() => go(index - 1)} />
        ) : null}
        {index < last ? (
          <PhoneArrow side="right" onClick={() => go(index + 1)} />
        ) : null}
      </div>

      <div className="flex justify-center gap-1" aria-hidden>
        {slides.map((slide, slideIndex) => (
          <span
            key={slide.id}
            className={cn(
              "size-1.5 rounded-full",
              slideIndex === index ? "bg-primary" : "bg-muted-foreground/30"
            )}
          />
        ))}
      </div>

      {caption.trim() ? (
        <ScrollArea className="max-h-40">
          <p className="px-1 text-sm whitespace-pre-wrap">{caption}</p>
        </ScrollArea>
      ) : (
        <p className="px-1 text-sm text-muted-foreground">
          No caption yet. Add one in the Export window.
        </p>
      )}
    </div>
  )
}

function PhoneArrow({
  side,
  onClick,
}: {
  side: "left" | "right"
  onClick: () => void
}) {
  const Icon = side === "left" ? ChevronLeftIcon : ChevronRightIcon
  const label = side === "left" ? "Previous slide" : "Next slide"
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={onClick}
          className={cn(
            "absolute top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-black shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            side === "left" ? "left-2" : "right-2"
          )}
        >
          <Icon className="size-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
