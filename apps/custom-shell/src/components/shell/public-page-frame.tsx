import * as React from "react"

import { BrandLogo } from "@/components/shell/brand-logo"
import { useAppName, useBrandLogo, usePublicTheme } from "@/lib/branding"
import { cn } from "@/lib/utils"

/**
 * The shared frame for every signed-out / public page (auth, pricing): a
 * full-height muted canvas that centers its single child both horizontally and
 * vertically, so public pages are framed identically instead of each
 * hand-rolling its own <main> wrapper.
 *
 * It also carries the branding above the content — the admin-set logo, when
 * there is one, and the app name — which is the one place a signed-out visitor
 * sees which app they are signing in to.
 *
 * The rest of the public theme (brand color, text color, font, roundness) is
 * already on <body> from `__root.tsx`, so it reaches this page without the
 * frame doing anything. The canvas is the one part that cannot be: it is a
 * Tailwind class, not a variable, so a saved background color is painted here.
 */
export function PublicPageFrame({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  const appName = useAppName()
  const logo = useBrandLogo()
  const { backgroundColor } = usePublicTheme()

  return (
    <main
      className={cn(
        "grid min-h-screen place-items-center bg-muted/60 px-4 py-10",
        className
      )}
      style={backgroundColor ? { backgroundColor } : undefined}
    >
      <div className="flex w-full flex-col items-center gap-2 md:gap-3">
        <BrandLogo src={logo} appName={appName} />
        <p className="text-sm font-medium text-foreground">{appName}</p>
        {children}
      </div>
    </main>
  )
}
