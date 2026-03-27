import * as React from "react"
import { MoonStarIcon, SunMediumIcon } from "lucide-react"

import { useTheme } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"

type NavLink = {
  label: string
  active?: boolean
  href?: string
}

type StickyHeaderProps = {
  className?: string
  navLinks?: NavLink[]
  rightActions?: React.ReactNode
}

function ThemeToggleButton() {
  const { theme, setTheme } = useTheme()
  const isDark = theme === "dark"

  return (
    <Button
      variant="outline"
      size="icon"
      className="h-8 w-8"
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {isDark ? (
        <SunMediumIcon className="size-4" />
      ) : (
        <MoonStarIcon className="size-4" />
      )}
      <span className="sr-only">Toggle theme</span>
    </Button>
  )
}

export function StickyHeader({
  className,
  navLinks,
  rightActions,
}: StickyHeaderProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-40 flex h-16 shrink-0 items-center border-b bg-background/95 backdrop-blur",
        className
      )}
    >
      <div className="flex h-full flex-1 items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <SidebarTrigger className="-ml-1" />
          {navLinks && navLinks.length > 0 && (
            <div className="flex items-center gap-1">
              {navLinks.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  className={cn(
                    "inline-flex h-8 items-center rounded-md px-3 text-sm font-medium transition-colors",
                    link.active
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  {link.label}
                </a>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {rightActions}
          <ThemeToggleButton />
        </div>
      </div>
    </header>
  )
}
