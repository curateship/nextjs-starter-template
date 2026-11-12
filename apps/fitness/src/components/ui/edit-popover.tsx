import * as React from "react"
import { Popover as PopoverPrimitive } from "radix-ui"

import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Popover, PopoverContent } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

/**
 * A link's editor, opened as a popover under the chip or button that opened
 * it, in place of a window over the whole page (Tyler, 10 Nov 2026: "replace
 * all of the other modals that changes links to a popover instead").
 *
 * The popover is pinned to `anchorRef`, the element that was pressed, so the
 * editor can live anywhere in the tree, the way the windows it replaced did. A
 * press on that element while the popover is open leaves it open rather than
 * closing it and opening it again.
 *
 * It reads like a window cut down to size: a title, a body that scrolls when
 * the screen is short, and the window's footer order (Delete hard left, then
 * Cancel, then the primary).
 */
export function EditPopover({
  open,
  onOpenChange,
  anchorRef,
  wide = false,
  onOpenAutoFocus,
  className,
  children,
  "aria-label": ariaLabel,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  anchorRef: React.RefObject<HTMLElement | null>
  /** 40rem rather than 28rem, for an editor holding a list of links. */
  wide?: boolean
  onOpenAutoFocus?: (event: Event) => void
  className?: string
  children: React.ReactNode
  "aria-label"?: string
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverPrimitive.Anchor
        virtualRef={anchorRef as React.RefObject<HTMLElement>}
      />
      <PopoverContent
        align="start"
        sideOffset={8}
        collisionPadding={8}
        aria-label={ariaLabel}
        // theme.css draws the cards in here from Settings → Styling → Cards
        // inside modals, as they were when this editor was a window.
        data-edit-popover=""
        onOpenAutoFocus={onOpenAutoFocus}
        onInteractOutside={(event) => {
          const target = event.target
          if (
            target instanceof Node &&
            anchorRef.current?.contains(target)
          ) {
            event.preventDefault()
          }
        }}
        className={cn(
          "max-h-(--radix-popover-content-available-height) gap-0 overflow-y-auto p-0 transition-none",
          wide
            ? "w-[min(40rem,calc(100vw-1rem))]"
            : "w-[min(28rem,calc(100vw-1rem))]",
          className
        )}
      >
        {children}
      </PopoverContent>
    </Popover>
  )
}

export function EditPopoverHeader({
  title,
  description,
}: {
  title: React.ReactNode
  description?: React.ReactNode
}) {
  return (
    <div className="grid gap-1 px-4 pt-4">
      <p className="truncate text-sm font-medium">{title}</p>
      {description ? (
        <p className="text-sm text-muted-foreground">{description}</p>
      ) : null}
    </div>
  )
}

export function EditPopoverBody({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "grid gap-4 p-4 **:data-[slot=card]:shadow-none",
        className
      )}
      {...props}
    />
  )
}

export function EditPopoverFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-row items-center justify-end gap-2 px-4 pb-4",
        className
      )}
      {...props}
    />
  )
}

/**
 * `FormDialog`'s rule for an editor that holds typed work, as a popover: once
 * something is edited, a click outside, Escape and Cancel all ask before the
 * edits are thrown away. A clean editor closes at once.
 */
export function FormPopover({
  open = true,
  dirty,
  busy = false,
  onClose,
  anchorRef,
  wide,
  onOpenAutoFocus,
  "aria-label": ariaLabel,
  children,
}: {
  open?: boolean
  dirty: boolean
  /** A save in flight, which refuses every way of closing. */
  busy?: boolean
  onClose: () => void
  anchorRef: React.RefObject<HTMLElement | null>
  wide?: boolean
  onOpenAutoFocus?: (event: Event) => void
  "aria-label"?: string
  children: (requestClose: () => void) => React.ReactNode
}) {
  const [confirmingDiscard, setConfirmingDiscard] = React.useState(false)

  const requestClose = React.useCallback(() => {
    if (busy) return
    if (dirty) {
      setConfirmingDiscard(true)
      return
    }
    onClose()
  }, [busy, dirty, onClose])

  return (
    <>
      <EditPopover
        open={open}
        onOpenChange={(next) => {
          // The discard question is a window of its own over the popover, so
          // pressing it must not count as a click outside.
          if (!next && !confirmingDiscard) requestClose()
        }}
        anchorRef={anchorRef}
        wide={wide}
        onOpenAutoFocus={onOpenAutoFocus}
        aria-label={ariaLabel}
      >
        {children(requestClose)}
      </EditPopover>
      <ConfirmDialog
        open={confirmingDiscard}
        onOpenChange={setConfirmingDiscard}
        title="Discard changes?"
        description="This editor has edits that have not been saved. Closing it now throws them away."
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        onConfirm={() => {
          setConfirmingDiscard(false)
          onClose()
        }}
      />
    </>
  )
}
