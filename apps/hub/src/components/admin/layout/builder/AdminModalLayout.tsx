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
import { ScrollArea } from "@/components/ui/scroll-area"

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
        "flex max-h-[calc(100vh-4rem)] min-h-0 flex-col overflow-hidden p-0",
        size === "default" && "max-w-[840px]",
        size === "wide" && "h-[calc(100vh-4rem)] max-h-[820px] max-w-[960px]",
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
      className={cn("min-h-0 overflow-y-auto px-6 pt-6 pb-0", className)}
      {...props}
    />
  )
}

function AdminModalScrollBody({
  className,
  viewportClassName,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  viewportClassName?: string
}) {
  return (
    <AdminModalBody className={cn("flex-1 overflow-hidden p-0", className)} {...props}>
      <ScrollArea className="h-full">
        <div className={cn("px-6 pt-6 pb-0 pr-8 [&_h3]:pt-4", viewportClassName)}>
          {children}
        </div>
      </ScrollArea>
    </AdminModalBody>
  )
}

function AdminModalFooter({ className, ...props }: React.ComponentProps<typeof DialogFooter>) {
  return (
    <DialogFooter
      className={cn(
        "px-6 py-6 sm:flex-row sm:items-center sm:justify-between",
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
  AdminModalScrollBody,
  AdminModalTitle,
}
