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
        "flex h-dvh max-h-dvh min-h-0 flex-col overflow-hidden p-0 sm:h-auto sm:max-h-[calc(100vh-4rem)]",
        size === "default" && "sm:max-w-[840px]",
        size === "wide" && "sm:h-[calc(100vh-4rem)] sm:max-h-[820px] sm:max-w-[960px]",
        className
      )}
      {...props}
    />
  )
}

function AdminModalHeader({ className, ...props }: React.ComponentProps<typeof DialogHeader>) {
  return <DialogHeader className={cn("gap-2 px-4 pt-4 pb-0 sm:px-6 sm:pt-6", className)} {...props} />
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
      className={cn("min-h-0 overflow-y-auto px-4 pt-4 pb-0 sm:px-6 sm:pt-6", className)}
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
        <div
          className={cn(
            "px-4 pt-4 pb-0 pr-4 sm:px-6 sm:pt-6 sm:pr-8 [&_h3]:pt-4 max-sm:**:data-[slot=card-group]:gap-6 max-sm:**:data-[slot=card]:rounded-none max-sm:**:data-[slot=card]:border-0 max-sm:**:data-[slot=card]:bg-transparent max-sm:**:data-[slot=card]:p-0 max-sm:**:data-[slot=card]:shadow-none max-sm:**:data-[slot=card]:ring-0 max-sm:**:data-[slot=card-header]:p-0 max-sm:**:data-[slot=card-header]:pb-2 max-sm:**:data-[slot=card-content]:p-0",
            viewportClassName
          )}
        >
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
        "px-4 py-4 sm:px-6 sm:py-6",
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
