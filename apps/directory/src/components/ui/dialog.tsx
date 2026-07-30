"use client"

import * as React from "react"
import XIcon from "lucide-react/dist/esm/icons/x.js"
import { Dialog as DialogPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"

type DialogContentVariant = "default" | "admin"

const DialogContentVariantContext =
  React.createContext<DialogContentVariant>("default")

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
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
          "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 !pointer-events-auto outline-none max-sm:!inset-0 max-sm:!h-dvh max-sm:!max-h-dvh max-sm:!w-screen max-sm:!max-w-none max-sm:!translate-x-0 max-sm:!translate-y-0 max-sm:!rounded-none max-sm:!ring-0 max-sm:overflow-y-auto sm:max-w-sm data-[variant=admin]:flex data-[variant=admin]:max-h-[calc(100vh-4rem)] data-[variant=admin]:flex-col data-[variant=admin]:gap-0 data-[variant=admin]:overflow-hidden data-[variant=admin]:p-0 data-[variant=admin]:sm:max-w-3xl data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
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
                type="button"
                variant="ghost"
                size="icon-sm"
                className={cn(
                  "absolute top-4 right-5",
                  variant === "admin" && "top-5"
                )}
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
        contentVariant === "admin" && "relative",
        className
      )}
      {...props}
    />
  )
}

function DialogBody({ className, ...props }: React.ComponentProps<"div">) {
  const contentVariant = React.useContext(DialogContentVariantContext)

  return (
    // The admin scroll viewport tucks 8px up under the header's bottom padding
    // and the body takes those 8px back as its own top padding (see the modal
    // CSS in styles.css): the visible gap is unchanged, but a focus ring on the
    // first control now paints inside the viewport instead of being clipped at
    // its top edge.
    <ScrollArea
      className={cn(
        "min-h-0",
        contentVariant === "admin" && "-mt-2 flex flex-1 flex-col overflow-hidden"
      )}
    >
      <div
        data-slot="dialog-body"
        className={cn("grid", className)}
        {...props}
      />
    </ScrollArea>
  )
}

function DialogFooter({
  className,
  variant = "default",
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  variant?: "default" | "plain"
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      data-variant={variant}
      className={cn(
        // The footer sits directly on the modal surface: no band, no divider.
        "flex flex-row items-center justify-end gap-2 **:data-[slot=button]:h-9 **:data-[slot=button]:w-auto",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="outline">Close</Button>
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogFooterActions({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer-actions"
      className={cn("flex w-auto flex-row items-center gap-2", className)}
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
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogFooterActions,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
