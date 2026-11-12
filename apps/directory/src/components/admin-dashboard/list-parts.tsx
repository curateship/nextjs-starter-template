import type * as React from "react"

import { Chip } from "@/components/crm/crm-table"
import { Button } from "@/components/ui/button"
import { FieldLabel } from "@/components/ui/field-label"
import { cn } from "@/lib/utils"

/**
 * Small pieces the Users and Feedback tabs draw with, drawn as the CRM draws
 * its own (`crm-people-list.tsx`, `inbox-list-panel.tsx`, `contact-panel.tsx`).
 */

/** Tags a row shows before it stops; the rest are on the right panel. */
const TAGS_SHOWN = 2

/** A row's first tags as chips, then "+3" for the rest. */
export function TagChips({ tags }: { tags: string[] }) {
  if (tags.length === 0) return <span className="text-muted-foreground">None</span>
  return (
    <span className="flex items-center gap-1 whitespace-nowrap">
      {tags.slice(0, TAGS_SHOWN).map((tag) => (
        <Chip key={tag} muted>
          {tag}
        </Chip>
      ))}
      {tags.length > TAGS_SHOWN ? <span className="text-xs text-muted-foreground">+{tags.length - TAGS_SHOWN}</span> : null}
    </span>
  )
}

/** One filter in Filter's dropdown: its label, then its Select. */
export function FilterRow({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {children}
    </div>
  )
}

/**
 * An action row under a record ⋮'s groups: a ghost button with its icon, as
 * the CRM's person ⋮ draws Delete contact. `destructive` draws it red.
 */
export function MenuActionRow({
  icon,
  destructive = false,
  disabled = false,
  onClick,
  children,
}: {
  icon: React.ReactNode
  destructive?: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      disabled={disabled}
      className={cn(
        "w-full justify-start gap-2 px-2 font-normal [&_svg]:size-4",
        destructive && "text-destructive hover:text-destructive"
      )}
      onClick={onClick}
    >
      {icon}
      {children}
    </Button>
  )
}
