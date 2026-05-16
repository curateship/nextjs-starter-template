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
      <DialogHeader className="relative space-y-1 px-6 py-5 text-left">
        <DialogTitle className="truncate">{title}</DialogTitle>
        {description ? (
          <DialogDescription>{description}</DialogDescription>
        ) : null}
        <DialogClose asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="absolute top-4 right-5"
          >
            <XIcon className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </Button>
        </DialogClose>
      </DialogHeader>

      <ScrollArea className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="px-6 py-6">
          <div className={cn("space-y-8", bodyClassName)}>{children}</div>
        </div>
      </ScrollArea>

      {footer ? (
        <DialogFooter
          className={cn(
            "mx-0 mb-0 flex-row items-center justify-end rounded-none border-t-0 bg-transparent px-6 py-5",
            footerClassName
          )}
        >
          {footer}
        </DialogFooter>
      ) : null}
    </DialogContent>
  )
}
