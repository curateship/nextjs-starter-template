import { Loader2Icon } from "lucide-react"
import type * as React from "react"

import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

/**
 * The frame of a three-column dashboard's "New …" dropdown (UI standard,
 * "Three-column dashboards"; Tyler, 19 Oct 2026: "Every dashboard probably
 * need to add something that belongs to it"). The screen hands in its fields,
 * title first and the rest in pairs; the frame puts "Create …" at the bottom
 * right and makes Enter in any field press it. There is no "More options".
 *
 * The screen holds the typed values itself, so clicking away keeps them for
 * the next opening; it resets them once the thing is made. Project's
 * `QuickNewTask` is the drawing this frame was taken from.
 */
export function NewRecordDropdown({
  label,
  open,
  onOpenChange,
  submitLabel,
  busy,
  onSubmit,
  trigger,
  choices,
  align = "end",
  wide = false,
  children,
}: {
  /** The form's name, read out: "New contact". */
  label: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** "Create contact". */
  submitLabel: string
  busy: boolean
  onSubmit: () => void
  /** The header's button that opens it. */
  trigger: React.ReactNode
  /**
   * A first step in place of the form, such as New contact's two ways to add
   * somebody. The screen swaps it for the form once one is picked.
   */
  choices?: React.ReactNode
  /** "start" for a + at a left panel's header, so it opens over the middle. */
  align?: "start" | "end"
  /** 30rem rather than 20rem, for a form holding a rule builder (Add segment). */
  wide?: boolean
  children: React.ReactNode
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      {/* transition-none: the popover's duration-100 is for its opening
          animation, but with no property named it also eased the width, so
          picking a choice slid the wider form out from the left (Tyler,
          9 Nov 2026: "its clicking one of these that slides in from the
          left"). The form now replaces the choices at once. */}
      <PopoverContent align={align} className={
          choices
            ? "w-56 p-1.5 transition-none"
            : wide
              ? "w-[min(30rem,calc(100vw-2rem))] p-3 transition-none"
              : "w-80 p-3 transition-none"
        }>
        {choices ?? (
        <form
          className="grid gap-4"
          aria-label={label}
          onSubmit={(event) => {
            event.preventDefault()
            onSubmit()
          }}
        >
          {children}
          <div className="flex items-center justify-end gap-2">
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
              {submitLabel}
            </Button>
          </div>
        </form>
        )}
      </PopoverContent>
    </Popover>
  )
}
