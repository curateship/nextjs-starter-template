"use client"

import * as React from "react"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { cn } from "@/lib/utils/tailwind"

interface SiteThemeToggleProps {
  defaultTheme?: 'system' | 'light' | 'dark'
  variant?: "icon" | "menu-item"
  className?: string
  onToggle?: () => void
}

export function SiteThemeToggle({
  defaultTheme = 'system',
  variant = "icon",
  className,
  onToggle,
}: SiteThemeToggleProps) {
  const [mounted, setMounted] = React.useState(false)
  const { theme, setTheme, resolvedTheme } = useTheme()

  React.useEffect(() => {
    setMounted(true)
  }, [])

  const toggleTheme = () => {
    // Simple toggle between light and dark
    if (theme === 'system') {
      setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
    } else {
      setTheme(theme === 'dark' ? 'light' : 'dark')
    }

    onToggle?.()
  }

  const isDarkMode =
    mounted && (theme === 'dark' || (theme === 'system' && resolvedTheme === 'dark'))
  const label = isDarkMode ? "Light mode" : "Dark mode"

  // Don't render until mounted to avoid hydration issues
  if (!mounted) {
    if (variant === "menu-item") {
      return (
        <button
          disabled
          className={cn(
            "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm opacity-60",
            className
          )}
        >
          <Sun className="h-4 w-4" />
          Toggle theme
        </button>
      )
    }

    return (
      <button
        disabled
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-md transition-colors",
          className
        )}
      >
        <Sun className="h-4 w-4" />
        <span className="sr-only">Toggle theme</span>
      </button>
    )
  }

  if (variant === "menu-item") {
    return (
      <button
        onClick={toggleTheme}
        className={cn(
          "hover:bg-accent hover:text-accent-foreground flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors",
          className
        )}
      >
        {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        {label}
      </button>
    )
  }

  return (
    <button
      onClick={toggleTheme}
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-md transition-colors hover:bg-accent hover:text-accent-foreground",
        className
      )}
      aria-label="Toggle theme"
    >
      <Sun className="h-4 w-4 block dark:hidden" />
      <Moon className="h-4 w-4 hidden dark:block" />
    </button>
  )
}
