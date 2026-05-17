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
import { cn } from "@/lib/utils"

type AdminModalContentProps = {
  title: React.ReactNode
  description?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string
  bodyClassName?: string
  footerClassName?: string
}

export function AdminModalContent({
  title,
  description,
  children,
  footer,
  className,
  bodyClassName,
  footerClassName,
}: AdminModalContentProps) {
  return (
    <DialogContent
      variant="admin"
      showCloseButton={false}
      className={cn(
        "max-h-[calc(100vh-4rem)] overflow-hidden p-0",
        className
      )}
    >
      <DialogHeader className="relative px-6 pt-6 pb-0 text-left">
        <DialogTitle className="truncate">{title}</DialogTitle>
        {description ? (
          <DialogDescription>{description}</DialogDescription>
        ) : null}
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
      </DialogHeader>

      <ScrollArea className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div
          className={cn(
            "grid gap-6 px-6 pt-6 pb-6 **:data-[slot=card]:shadow-none",
            bodyClassName
          )}
        >
          {children}
        </div>
      </ScrollArea>

      {footer ? (
        <DialogFooter variant="plain" className={cn("px-6 pb-6", footerClassName)}>
          {footer}
        </DialogFooter>
      ) : null}
    </DialogContent>
  )
}
