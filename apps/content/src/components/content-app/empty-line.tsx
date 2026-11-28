import * as React from "react"
import { PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"

/**
 * An empty list's line with its New button under it. The header's New button
 * shows only "+" in a narrow header, as on a phone, so a line saying "Press
 * New account" needs the button it names beside it.
 */
export function EmptyLine({ line, action }: { line: React.ReactNode; action: React.ReactNode }) {
  return (
    <div className="grid justify-items-center gap-3">
      <p>{line}</p>
      {action}
    </div>
  )
}

/** The New button an empty line carries, outlined as the header's buttons are. */
export function EmptyLineButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button type="button" variant="outline" size="sm" onClick={onClick}>
      <PlusIcon className="size-4" />
      {label}
    </Button>
  )
}
