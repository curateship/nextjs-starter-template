"use client"

import * as React from "react"
import { XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils/tailwind"

type DashboardModalContentProps = Omit<React.ComponentProps<typeof DialogContent>, "children" | "showCloseButton" | "size"> & {
  title: React.ReactNode
  description?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
  bodyClassName?: string
  viewportClassName?: string
}

function DashboardModalContent({
  title,
  description,
  children,
  footer,
  className,
  bodyClassName,
  viewportClassName,
  ...props
}: DashboardModalContentProps) {
  return (
    <DialogContent
      showCloseButton={false}
      size="admin"
      className={cn("flex max-h-[calc(100vh-4rem)] flex-col overflow-hidden p-0", className)}
      {...props}
    >
      <DashboardModalHeader>
        <DashboardModalTitle>{title}</DashboardModalTitle>
        <DashboardModalCloseButton />
      </DashboardModalHeader>

      <DashboardModalScrollBody className={bodyClassName} viewportClassName={viewportClassName}>
        {description ? (
          <DashboardModalDescription className="mb-4">{description}</DashboardModalDescription>
        ) : null}
        {children}
      </DashboardModalScrollBody>

      {footer ? <DashboardModalFooter>{footer}</DashboardModalFooter> : null}
    </DialogContent>
  )
}

function DashboardModalHeader({ className, ...props }: React.ComponentProps<typeof DialogHeader>) {
  return <DialogHeader className={cn("relative px-6 pt-6 text-left", className)} {...props} />
}

function DashboardModalTitle({ className, ...props }: React.ComponentProps<typeof DialogTitle>) {
  return <DialogTitle className={cn("truncate pr-8", className)} {...props} />
}

function DashboardModalDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogDescription>) {
  return <DialogDescription className={cn("text-sm", className)} {...props} />
}

function DashboardModalCloseButton() {
  return (
    <DialogClose asChild>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="absolute top-5 right-5"
      >
        <XIcon className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </Button>
    </DialogClose>
  )
}

function DashboardModalScrollBody({
  className,
  viewportClassName,
  children,
  ...props
}: Omit<React.ComponentProps<typeof ScrollArea>, "children"> & {
  children: React.ReactNode
  viewportClassName?: string
}) {
  return (
    <ScrollArea className={cn("flex min-h-0 flex-1 flex-col overflow-hidden", className)} {...props}>
      <div className={cn("p-6", viewportClassName)}>
        {children}
      </div>
    </ScrollArea>
  )
}

function DashboardModalFooter({ className, ...props }: React.ComponentProps<typeof DialogFooter>) {
  return <DialogFooter className={cn("px-6 pb-6", className)} {...props} />
}

export {
  DashboardModalCloseButton,
  DashboardModalContent,
  DashboardModalDescription,
  DashboardModalFooter,
  DashboardModalHeader,
  DashboardModalScrollBody,
  DashboardModalTitle,
}
