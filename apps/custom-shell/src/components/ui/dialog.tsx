"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { XIcon } from "lucide-react"

type DialogContentVariant = "default" | "admin"

const DialogContentVariantContext =
  React.createContext<DialogContentVariant>("default")

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

// Interacting with a toast (e.g. dismissing the error toast) must not count
// as clicking outside the modal — without this, closing a toast closes the
// dialog under it.
function isToastInteraction(event: { target: EventTarget | null }) {
  return (
    event.target instanceof Element &&
    Boolean(event.target.closest("[data-sonner-toaster]"))
  )
}

function DialogContent({
  className,
  children,
  variant = "default",
  showCloseButton = true,
  onPointerDownOutside,
  onInteractOutside,
  onFocusOutside,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  variant?: DialogContentVariant
  showCloseButton?: boolean
}) {
  return (
    <DialogPortal>
      {/* Overlay is an explicit close target. Radix's own outside-press dismiss
          ignores the first click after a Select inside the dialog was used (an
          upstream DismissableLayer bug), so clicking the backdrop closes here
          directly and reliably. */}
      <DialogPrimitive.Close asChild>
        <DialogOverlay />
      </DialogPrimitive.Close>
      <DialogPrimitive.Content
        data-slot="dialog-content"
        data-variant={variant}
        className={cn(
          // !pointer-events-auto keeps the modal clickable even while a Select
          // inside it sets the outside world to pointer-events:none, so an
          // inside click dismisses the dropdown instead of passing through to
          // the backdrop (which is a close target) and closing the whole modal.
          "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 !pointer-events-auto outline-none max-sm:!inset-0 max-sm:!h-dvh max-sm:!max-h-dvh max-sm:!w-screen max-sm:!max-w-none max-sm:!translate-x-0 max-sm:!translate-y-0 max-sm:!rounded-none max-sm:!ring-0 max-sm:overflow-y-auto sm:max-w-sm data-[variant=admin]:flex data-[variant=admin]:max-h-[calc(100vh-4rem)] data-[variant=admin]:flex-col data-[variant=admin]:gap-0 data-[variant=admin]:overflow-hidden data-[variant=admin]:p-0 data-[variant=admin]:sm:max-w-3xl data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className
        )}
        onPointerDownOutside={(event) => {
          onPointerDownOutside?.(event)
          if (isToastInteraction(event)) event.preventDefault()
        }}
        onInteractOutside={(event) => {
          onInteractOutside?.(event)
          if (isToastInteraction(event)) event.preventDefault()
        }}
        onFocusOutside={(event) => {
          onFocusOutside?.(event)
          if (isToastInteraction(event)) event.preventDefault()
        }}
        {...props}
      >
        <DialogContentVariantContext.Provider value={variant}>
          {children}
          {showCloseButton && (
            <DialogPrimitive.Close data-slot="dialog-close" asChild>
              <Button
                variant="ghost"
                className={cn(
                  "absolute top-4 right-5",
                  variant === "admin" && "top-5"
                )}
                size="icon-sm"
              >
                <XIcon className="size-4" />
                <span className="sr-only">Close</span>
              </Button>
            </DialogPrimitive.Close>
          )}
        </DialogContentVariantContext.Provider>
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  const contentVariant = React.useContext(DialogContentVariantContext)

  return (
    <div
      data-slot="dialog-header"
      className={cn(
        "flex flex-col gap-2 text-left",
        contentVariant === "admin"
          ? "relative p-6"
          : "px-6 py-5",
        className
      )}
      {...props}
    />
  )
}

/**
 * A strip that stays put between the header and the scrolling body — a search
 * field, a filter, an add button.
 *
 * It sits outside `DialogBody` on purpose. Inside, it scrolls away with the
 * very content it filters, and the only other way to hold it still is a second
 * scroll area nested inside the body's — which never scrolls, so the window
 * drags the search box out of view instead.
 */
function DialogToolbar({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-toolbar"
      className={cn("flex shrink-0 items-center gap-2", className)}
      {...props}
    />
  )
}

function DialogBody({ className, ...props }: React.ComponentProps<"div">) {
  const contentVariant = React.useContext(DialogContentVariantContext)

  return (
    // The admin scroll viewport tucks 8px up under the header's bottom padding
    // and the body takes those 8px back as its own top padding: the visible
    // gap is unchanged, but a focus ring on the first control now paints
    // inside the viewport instead of being clipped at its top edge.
    <ScrollArea
      className={cn(
        "min-h-0",
        contentVariant === "admin" && "-mt-2 flex flex-1 flex-col overflow-hidden"
      )}
    >
      <div
        data-slot="dialog-body"
        className={cn(
          contentVariant === "admin"
            ? "grid gap-6 px-6 pt-2 pb-6 **:data-[slot=card]:shadow-none"
            : "px-6 py-6",
          className
        )}
        {...props}
      />
    </ScrollArea>
  )
}

/**
 * Every window ends the same way, so nobody has to re-read the footer:
 *
 *     [Delete]  ……………  [Cancel] [Primary]
 *
 * - **Delete / Remove** — the button that throws something away — sits hard
 *   left with `className="mr-auto"`, so it can never be mistaken for the
 *   primary. Omit it when the window has nothing to throw away.
 * - **Cancel** is `variant="outline"`, always directly left of the primary, and
 *   is disabled for as long as the action is running (same `disabled` as the
 *   primary), so a half-finished save cannot be walked away from.
 * - **Primary label** follows one scheme: "Save changes" when editing something
 *   that already exists, "Create <thing>" when making a new one, and the
 *   action's own verb otherwise ("Select", "Send").
 * - **A window with nothing to save** — a preview, a details view, an editor
 *   that auto-saves — ends with a single primary "Done" and no Cancel, because
 *   there is nothing a Cancel could undo.
 * - **Titles are sentence case**: "Edit workspace", not "Edit Workspace".
 *   Confirmations ask a question: "Delete this workspace?".
 */
function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        // The footer sits directly on the modal surface: no band, no divider.
        // One spacing for every window, so the buttons land in the same place
        // in all of them. It mirrors the padding `theme.css` sets from
        // `--shell-modal-padding`, which is what actually reaches the screen.
        "flex flex-row items-center justify-end gap-2 px-6 pt-0 pb-6 **:data-[slot=button]:h-9",
        className
      )}
      {...props}
    />
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  const contentVariant = React.useContext(DialogContentVariantContext)

  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "text-lg leading-none font-medium",
        contentVariant === "admin" && "truncate",
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogToolbar,
}
