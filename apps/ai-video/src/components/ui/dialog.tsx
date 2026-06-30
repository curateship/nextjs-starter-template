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
        "fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  variant = "default",
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  variant?: DialogContentVariant
  showCloseButton?: boolean
}) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        data-variant={variant}
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none !pointer-events-auto max-sm:!inset-0 max-sm:!h-dvh max-sm:!max-h-dvh max-sm:!w-screen max-sm:!max-w-none max-sm:!translate-x-0 max-sm:!translate-y-0 max-sm:!rounded-none max-sm:!ring-0 max-sm:overflow-y-auto sm:max-w-sm data-[variant=admin]:flex data-[variant=admin]:max-h-[calc(100vh-4rem)] data-[variant=admin]:flex-col data-[variant=admin]:gap-0 data-[variant=admin]:overflow-hidden data-[variant=admin]:p-0 data-[variant=admin]:sm:max-w-3xl data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className
        )}
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
        "flex flex-col gap-1 text-left",
        contentVariant === "admin"
          ? "relative px-6 pt-6 pb-0"
          : "px-6 py-5",
        className
      )}
      {...props}
    />
  )
}

function DialogBody({ className, ...props }: React.ComponentProps<"div">) {
  const contentVariant = React.useContext(DialogContentVariantContext)

  return (
    <ScrollArea
      className={cn(
        "min-h-0",
        contentVariant === "admin" && "flex flex-1 flex-col overflow-hidden"
      )}
    >
      <div
        data-slot="dialog-body"
        className={cn(
          contentVariant === "admin"
            ? "grid gap-6 px-6 pt-6 pb-6 **:data-[slot=card]:shadow-none"
            : "px-6 py-6",
          className
        )}
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
  const contentVariant = React.useContext(DialogContentVariantContext)
  const isAdminPlain = contentVariant === "admin" && variant === "plain"

  return (
    <div
      data-slot="dialog-footer"
      data-variant={variant}
      className={cn(
        "flex flex-row justify-end gap-2 **:data-[slot=button]:h-9",
        variant === "default" && "rounded-b-xl border-t bg-muted/50 px-6 py-5",
        variant === "plain" &&
          "items-center rounded-none border-t-0 bg-transparent",
        variant === "plain" && !isAdminPlain && "px-6 py-5",
        isAdminPlain && "px-6 pb-6",
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

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  const contentVariant = React.useContext(DialogContentVariantContext)

  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "text-base leading-none font-medium",
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
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
