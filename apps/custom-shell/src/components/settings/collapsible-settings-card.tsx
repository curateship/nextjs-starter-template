"use client"

import * as React from "react"
import { ChevronDown } from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from "@/components/ui/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { focusRingInset } from "@/lib/focus-ring"
import {
  collapseStorageKey,
  useRememberedCollapse,
} from "@/lib/remembered-choice"
import { cn } from "@/lib/utils"

type CollapsibleSettingsCardProps = {
  storageId: string
  title: React.ReactNode
  description?: React.ReactNode
  children: React.ReactNode
  className?: string
  contentClassName?: string
}

/**
 * A settings card whose body collapses. Hovering the card reveals an arrow in
 * the header; clicking the header toggles the body, and the open/closed choice
 * is remembered per card in this browser. Mirrors the sidebar-section pattern in
 * `sidebar-group-collapsible.tsx`.
 */
export function CollapsibleSettingsCard({
  storageId,
  title,
  description,
  children,
  className,
  contentClassName,
}: CollapsibleSettingsCardProps) {
  const [open, setOpen, noFlashKey] = useRememberedCollapse(
    collapseStorageKey.settingsCard(storageId)
  )

  return (
    <Card className={className}>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className={cn(
              "group/trigger flex w-full cursor-pointer select-none items-start justify-between gap-3 rounded-md px-4 text-left group-data-[size=sm]/card:px-3",
              // The header runs the full width of the card, and a card hides
              // what overflows it, so the ring has to be drawn inside.
              focusRingInset
            )}
          >
            <div className="grid gap-1">
              <CardTitle>{title}</CardTitle>
              {description ? (
                <CardDescription>{description}</CardDescription>
              ) : null}
            </div>
            <ChevronDown className="mt-1 size-4 shrink-0 text-muted-foreground opacity-0 transition-[opacity,transform] duration-200 group-hover/card:opacity-100 group-focus-visible/trigger:opacity-100 group-data-[state=closed]/trigger:-rotate-90" />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent data-collapse-key={noFlashKey}>
          <CardContent className={cn("pt-4", contentClassName)}>
            {children}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  )
}
