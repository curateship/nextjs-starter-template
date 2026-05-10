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
      showCloseButton={false}
      className={cn(
        "flex max-h-[min(600px,80vh)] flex-col gap-0 p-0 sm:max-w-3xl",
        className
      )}
    >
      <DialogHeader className="relative h-14 space-y-0 text-left">
        <DialogTitle className="flex h-full items-center truncate px-6 pr-14">
          {title}
        </DialogTitle>
        <DialogClose asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="absolute top-1/2 right-3 -translate-y-1/2"
          >
            <XIcon className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </Button>
        </DialogClose>
      </DialogHeader>

      <ScrollArea className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="p-6">
          {description ? (
            <DialogDescription className="mb-4">{description}</DialogDescription>
          ) : null}
          <div className={cn("space-y-8", bodyClassName)}>{children}</div>
        </div>
      </ScrollArea>

      {footer ? (
        <DialogFooter
          className={cn(
            "mx-0 mb-0 flex-row items-center justify-end rounded-none border-t-0 bg-transparent px-6 pt-2 pb-5",
            footerClassName
          )}
        >
          {footer}
        </DialogFooter>
      ) : null}
    </DialogContent>
  )
}
