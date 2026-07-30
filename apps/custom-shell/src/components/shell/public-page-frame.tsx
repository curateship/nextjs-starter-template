import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * The shared frame for every signed-out / public page (auth, pricing): a
 * full-height muted canvas that centers its single child both horizontally and
 * vertically, so public pages are framed identically instead of each
 * hand-rolling its own <main> wrapper.
 */
export function PublicPageFrame({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <main
      className={cn(
        "grid min-h-screen place-items-center bg-muted/60 px-4 py-10",
        className
      )}
    >
      {children}
    </main>
  )
}
