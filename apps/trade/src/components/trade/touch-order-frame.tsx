import * as React from "react"

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

/**
 * A chart order window at the pointer on a wide screen and in the shared
 * bottom sheet on a narrow one. The sheet owns the backdrop on touch screens,
 * so a tap outside closes once and cannot fall through to the chart.
 */
export function TouchOrderFrame({
  label,
  wide,
  role = "dialog",
  desktopClassName,
  sheetClassName,
  desktopStyle,
  desktopRef,
  sheetScrollable = false,
  onClose,
  children,
}: {
  label: string
  wide: boolean
  role?: "dialog" | "menu"
  desktopClassName: string
  sheetClassName?: string
  desktopStyle?: React.CSSProperties
  desktopRef?: React.Ref<HTMLDivElement>
  sheetScrollable?: boolean
  onClose: () => void
  children: React.ReactNode
}) {
  if (!wide) {
    return (
      <Sheet open onOpenChange={(open) => (open ? undefined : onClose())}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className={cn(
            "max-h-[calc(100dvh-8px)] gap-0 overflow-hidden rounded-t-xl bg-card",
            sheetClassName
          )}
          onPointerDown={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.stopPropagation()}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>{label}</SheetTitle>
          </SheetHeader>
          {role === "menu" ? (
            <div role="menu" aria-label={label}>
              {children}
            </div>
          ) : sheetScrollable ? (
            <ScrollArea className="min-h-0 flex-1">{children}</ScrollArea>
          ) : (
            children
          )}
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onPointerDown={onClose}
        onContextMenu={(event) => {
          event.preventDefault()
          onClose()
        }}
      />
      <div
        ref={desktopRef}
        role={role}
        aria-label={label}
        className={desktopClassName}
        style={desktopStyle}
        onPointerDown={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </>
  )
}
