import * as React from "react"
import { Popover as PopoverPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Popover({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />
}

function PopoverTrigger({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

/**
 * One wheel turn in pixels. A mouse reports pixels, a few setups report lines or
 * pages instead, and a line left at 1px would make a list crawl.
 */
function wheelPixels(delta: number, mode: number, box: Element): number {
  if (mode === 1) return delta * 16
  if (mode === 2) return delta * box.clientHeight
  return delta
}

/** Whether this box can take the wheel in the direction it is pointing. */
function takesWheel(box: Element, deltaX: number, deltaY: number): boolean {
  const style = getComputedStyle(box)
  const scrolls = (overflow: string) =>
    overflow === "auto" || overflow === "scroll"
  if (deltaY !== 0 && scrolls(style.overflowY)) {
    if (box.scrollHeight > box.clientHeight) return true
  }
  if (deltaX !== 0 && scrolls(style.overflowX)) {
    if (box.scrollWidth > box.clientWidth) return true
  }
  return false
}

/**
 * Scrolls a list inside the popover by hand while a window holds the page's
 * scrolling.
 *
 * A Dialog lets nothing scroll but its own content, and it enforces that by
 * naming that one element and cancelling every wheel turn anywhere else. A
 * popover renders at the end of the body, not inside the window, so the browser
 * refused to move any list in here: a 4608px column of categories sat in a 256px
 * box that the wheel could not touch, and the only ways down were the scrollbar
 * and the keyboard.
 *
 * It cannot be fixed by rendering the popover inside the window instead. The
 * window carries a transform, which makes it the containing block for the
 * popover's fixed positioning, and its `overflow-hidden` then clips anything
 * reaching past the window's edge, which is what a dropdown under a field near
 * the bottom does.
 *
 * So the popover scrolls its own lists. Setting `scrollTop` is not affected by
 * the cancelled wheel. Nothing happens unless the lock is actually on, and
 * nothing happens for a popover that did end up inside the window's content,
 * because there the browser is already doing it and a second push would double
 * the speed.
 */
function scrollWhileLocked(event: React.WheelEvent<HTMLElement>) {
  if (!document.body.hasAttribute("data-scroll-locked")) return
  const content = event.currentTarget
  if (content.closest('[data-slot="dialog-content"]')) return
  if (!(event.target instanceof Element)) return

  // The nearest box under the pointer that overflows the way the wheel is
  // pointing, which is what the browser would have picked.
  let box: Element | null = event.target
  while (box && !takesWheel(box, event.deltaX, event.deltaY)) {
    box = box === content ? null : box.parentElement
  }
  if (!box) return

  // Assigning past either end clamps on its own, so the list stops where it
  // should without the page behind it moving.
  if (event.deltaY) {
    box.scrollTop += wheelPixels(event.deltaY, event.deltaMode, box)
  }
  if (event.deltaX) {
    box.scrollLeft += wheelPixels(event.deltaX, event.deltaMode, box)
  }
}

function PopoverContent({
  className,
  align = "center",
  sideOffset = 4,
  onWheel,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        onWheel={(event) => {
          onWheel?.(event)
          if (event.defaultPrevented) return
          scrollWhileLocked(event)
        }}
        className={cn(
          "z-50 flex w-72 origin-(--radix-popover-content-transform-origin) flex-col gap-2.5 rounded-lg bg-popover p-2.5 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-hidden duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
}

function PopoverHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="popover-header"
      className={cn("flex flex-col gap-0.5 text-sm", className)}
      {...props}
    />
  )
}

function PopoverTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <div
      data-slot="popover-title"
      className={cn("font-medium", className)}
      {...props}
    />
  )
}

export { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger }
