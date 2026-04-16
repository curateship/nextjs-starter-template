"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

type AdminModalSize = "default" | "wide"

function AdminModalContent({
  className,
  size = "default",
  ...props
}: Omit<React.ComponentProps<typeof DialogContent>, "size"> & {
  size?: AdminModalSize
}) {
  return (
    <DialogContent
      size="admin"
      className={cn(
        "flex max-h-[calc(100vh-4rem)] flex-col overflow-hidden p-0",
        size === "default" && "max-w-[840px]",
        size === "wide" && "max-w-[960px]",
        className
      )}
      {...props}
    />
  )
}

function AdminModalHeader({ className, ...props }: React.ComponentProps<typeof DialogHeader>) {
  return <DialogHeader className={cn("gap-2 px-6 pt-6 pb-0", className)} {...props} />
}

function AdminModalTitle({ className, ...props }: React.ComponentProps<typeof DialogTitle>) {
  return <DialogTitle className={cn("text-lg font-semibold", className)} {...props} />
}

function AdminModalDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogDescription>) {
  return <DialogDescription className={cn("text-sm", className)} {...props} />
}

function AdminModalBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("overflow-y-auto px-6 pt-6 pb-0", className)}
      {...props}
    />
  )
}

function AdminModalFooter({ className, ...props }: React.ComponentProps<typeof DialogFooter>) {
  return (
    <DialogFooter
      className={cn(
        "border-t border-border/60 px-6 py-6 sm:flex-row sm:items-center sm:justify-between",
        className
      )}
      {...props}
    />
  )
}

export {
  AdminModalBody,
  AdminModalContent,
  AdminModalDescription,
  AdminModalFooter,
  AdminModalHeader,
  AdminModalTitle,
}
