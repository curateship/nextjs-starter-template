"use client"

import * as React from "react"
import { XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { CardTitle } from "@/components/ui/card"
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogFooterActions,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils/tailwind"

type DashboardModalContentProps = Omit<React.ComponentProps<typeof DialogContent>, "children" | "showCloseButton" | "size" | "title"> & {
  title: React.ReactNode
  description?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
  titleAccessory?: React.ReactNode
  footerClassName?: string
  bodyClassName?: string
  viewportClassName?: string
}

function DashboardModalContent({
  title,
  description,
  children,
  footer,
  titleAccessory,
  footerClassName,
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
        <div className="flex min-w-0 flex-wrap items-center gap-y-5 sm:flex-nowrap">
          <DashboardModalTitle className="min-w-0">{title}</DashboardModalTitle>
          {titleAccessory ? <div className="w-full shrink-0 sm:w-auto">{titleAccessory}</div> : null}
        </div>
        {description ? <DashboardModalDescription>{description}</DashboardModalDescription> : null}
        <DashboardModalCloseButton />
      </DashboardModalHeader>

      <DashboardModalScrollBody className={bodyClassName} viewportClassName={viewportClassName}>
        {children}
      </DashboardModalScrollBody>

      {footer ? <DashboardModalFooter className={footerClassName}>{footer}</DashboardModalFooter> : null}
    </DialogContent>
  )
}

function DashboardModalHeader({ className, ...props }: React.ComponentProps<typeof DialogHeader>) {
  return <DialogHeader className={cn("relative px-6 pt-6 pb-0 text-left", className)} {...props} />
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

function DashboardModalCardTitle({ className, ...props }: React.ComponentProps<typeof CardTitle>) {
  return <CardTitle className={cn("text-base", className)} {...props} />
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
      <div className={cn("grid gap-6 px-6 pt-2 pb-6 **:data-[slot=card]:shadow-none", viewportClassName)}>
        {children}
      </div>
    </ScrollArea>
  )
}

function DashboardModalFooter({ className, ...props }: React.ComponentProps<typeof DialogFooter>) {
  return <DialogFooter className={cn("px-6 pb-6", className)} {...props} />
}

function DashboardModalFooterActions({ className, ...props }: React.ComponentProps<typeof DialogFooterActions>) {
  return <DialogFooterActions className={className} {...props} />
}

export {
  DashboardModalCloseButton,
  DashboardModalCardTitle,
  DashboardModalContent,
  DashboardModalDescription,
  DashboardModalFooter,
  DashboardModalFooterActions,
  DashboardModalHeader,
  DashboardModalScrollBody,
  DashboardModalTitle,
}
