import * as React from "react"

import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
    <DialogContent variant="admin" className={className}>
      <DialogHeader>
        <DialogTitle className="truncate">{title}</DialogTitle>
        {description ? (
          <DialogDescription>{description}</DialogDescription>
        ) : null}
      </DialogHeader>

      <DialogBody>
        <div className={cn("space-y-8", bodyClassName)}>{children}</div>
      </DialogBody>

      {footer ? (
        <DialogFooter variant="plain" className={footerClassName}>
          {footer}
        </DialogFooter>
      ) : null}
    </DialogContent>
  )
}
