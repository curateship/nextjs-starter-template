"use client"

import * as React from "react"

import Loader2 from "lucide-react/dist/esm/icons/loader-circle.js"

import { Button } from "@/components/ui/button"
import { CardTitle } from "@/components/ui/card"
import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogFooterActions,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils/tailwind"

type DashboardModalContentProps = Omit<
  React.ComponentProps<typeof DialogContent>,
  "children" | "showCloseButton" | "variant" | "title"
> & {
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
    <DialogContent variant="admin" className={className} {...props}>
      <DialogHeader>
        {/* Title + its controls pack left; the ghost close button (rendered by
            DialogContent) floats top-right, so the row keeps clear of it. */}
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-4 pr-10 sm:flex-nowrap">
          <DashboardModalTitle className="min-w-0">{title}</DashboardModalTitle>
          {titleAccessory ? (
            <div className="w-full shrink-0 sm:w-auto">{titleAccessory}</div>
          ) : null}
        </div>
        {description ? (
          <DashboardModalDescription>{description}</DashboardModalDescription>
        ) : null}
      </DialogHeader>

      <DashboardModalScrollBody className={bodyClassName} viewportClassName={viewportClassName}>
        {children}
      </DashboardModalScrollBody>

      {footer ? (
        <DashboardModalFooter className={footerClassName}>{footer}</DashboardModalFooter>
      ) : null}
    </DialogContent>
  )
}

/**
 * The Cancel + submit pair almost every form modal ends with. Pulled out
 * because it was written by hand in ~20 places, identically apart from the
 * label and the form id.
 *
 * `cancelDisabled` is deliberately separate from `busy`: some modals lock the
 * Cancel button while saving and some let you back out mid-save. Each call site
 * keeps whichever it already had — leaving it unset renders no `disabled`
 * attribute at all, exactly as before.
 */
function DashboardModalFormFooter({
  busy,
  cancelDisabled,
  form,
  onCancel,
  submitLabel,
}: {
  busy?: boolean
  cancelDisabled?: boolean
  form: string
  onCancel: () => void
  submitLabel: React.ReactNode
}) {
  return (
    <>
      <Button type="button" variant="outline" onClick={onCancel} disabled={cancelDisabled}>
        Cancel
      </Button>
      <Button type="submit" form={form} disabled={busy}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : null}
        {submitLabel}
      </Button>
    </>
  )
}

function DashboardModalTitle({ className, ...props }: React.ComponentProps<typeof DialogTitle>) {
  return <DialogTitle className={cn("truncate", className)} {...props} />
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
      <div
        data-slot="dialog-body"
        className={cn(
          // The phone flatten of card chrome (border, background, radius, shadow)
          // lives in styles.css next to the modal card rules it has to beat; only
          // the padding collapse is left here.
          "grid max-sm:[&_.grid-cols-2]:grid-cols-1 max-sm:[&_.grid-cols-3]:grid-cols-1 max-sm:[&_.grid-cols-4]:grid-cols-1 max-sm:**:data-[slot=card]:p-0 max-sm:**:data-[slot=card-header]:p-0 max-sm:**:data-[slot=card-header]:pb-2 max-sm:**:data-[slot=card-content]:p-0",
          viewportClassName
        )}
      >
        {children}
      </div>
    </ScrollArea>
  )
}

function DashboardModalFooter({ className, ...props }: React.ComponentProps<typeof DialogFooter>) {
  return <DialogFooter className={className} {...props} />
}

function DashboardModalFooterActions({ className, ...props }: React.ComponentProps<typeof DialogFooterActions>) {
  return <DialogFooterActions className={className} {...props} />
}

export {
  DashboardModalCardTitle,
  DashboardModalContent,
  DashboardModalFooterActions,
  DashboardModalFormFooter,
}
