import * as React from "react"

import { useAppName } from "@/lib/app-name"
import { cn } from "@/lib/utils"

/**
 * The shared frame for every signed-out / public page (auth, pricing): a
 * full-height muted canvas that centers its single child both horizontally and
 * vertically, so public pages are framed identically instead of each
 * hand-rolling its own <main> wrapper.
 *
 * It also carries the app name above the content, which is the one place a
 * signed-out visitor sees which app they are signing in to.
 */
export function PublicPageFrame({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  const appName = useAppName()

  return (
    <main
      className={cn(
        "grid min-h-screen place-items-center bg-muted/60 px-4 py-10",
        className
      )}
    >
      <div className="flex w-full flex-col items-center gap-2 md:gap-3">
        <p className="text-sm font-medium text-foreground">{appName}</p>
        {children}
      </div>
    </main>
  )
}
