import * as React from "react"

import { Button } from "@/components/ui/button"

/** Ghost icon button used for workspace-header back/panel toggles. */
export function IconButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-8 shrink-0 text-muted-foreground"
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
    </Button>
  )
}
