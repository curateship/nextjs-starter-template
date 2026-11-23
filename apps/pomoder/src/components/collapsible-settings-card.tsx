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
import { cn } from "@/lib/utils"

type CollapsibleSettingsCardProps = {
  storageId: string
  title: React.ReactNode
  description?: React.ReactNode
  defaultOpen?: boolean
  children: React.ReactNode
  className?: string
  contentClassName?: string
}

/**
 * A settings card whose body collapses. Hovering the card reveals an arrow in
 * the header; clicking the header toggles the body, and the open/closed choice
 * is remembered per card in localStorage. Mirrors the sidebar-section pattern in
 * `sidebar-group-collapsible.tsx`.
 */
export function CollapsibleSettingsCard({
  storageId,
  title,
  description,
  defaultOpen = true,
  children,
  className,
  contentClassName,
}: CollapsibleSettingsCardProps) {
  const storageKey = `custom-shell-settings-card-${storageId}`
  const [open, setOpen] = React.useState(defaultOpen)

  // Defer the localStorage read to after mount so the server and first client
  // render agree (no hydration mismatch); this one-shot sync is not the
  // cascading-render pattern the lint rule warns about.
  React.useEffect(() => {
    setOpen(window.localStorage.getItem(storageKey) !== "closed")
  }, [storageKey])

  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen)
      window.localStorage.setItem(storageKey, nextOpen ? "open" : "closed")
    },
    [storageKey]
  )

  return (
    <Card className={className}>
      <Collapsible open={open} onOpenChange={handleOpenChange}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="group/trigger flex w-full cursor-pointer select-none items-start justify-between gap-3 px-4 text-left outline-none group-data-[size=sm]/card:px-3"
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
        <CollapsibleContent>
          <CardContent className={cn("pt-4", contentClassName)}>
            {children}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  )
}
