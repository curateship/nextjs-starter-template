import * as React from "react"
import { ChevronDownIcon, PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * A heading's arrow beside its "+": points down while open, right while
 * folded, and shows only while the heading is pointed at, folded too (Tyler,
 * 28 Oct 2026: "this icon should only appear on hover"). Always there on a phone.
 */
export function HeadingFoldButton({ label, folded, onClick }: { label: string; folded: boolean; onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      aria-label={folded ? `Open ${label}` : `Fold ${label}`}
      aria-expanded={!folded}
      className="opacity-0 group-hover/table-group:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
      onClick={onClick}
    >
      <ChevronDownIcon className={cn("size-3.5 transition-transform", folded && "-rotate-90")} />
    </Button>
  )
}

/** A heading's "+", faint until the heading is pointed at; always there on a phone. */
export function HeadingAddButton({ label, ...props }: { label: string } & React.ComponentProps<"button">) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      aria-label={`Add a task to ${label}`}
      className="opacity-0 group-hover/table-group:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100 [@media(hover:none)]:opacity-100"
      {...props}
    >
      <PlusIcon className="size-3.5" />
    </Button>
  )
}
