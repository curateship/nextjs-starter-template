"use client"

import * as React from "react"
import { MessageSquarePlusIcon, Moon, Sun } from "lucide-react"

import { useTheme } from "@/pages/dashboard/sticky-header/light-dark-switcher"
import { NotificationCenter } from "@/pages/dashboard/sticky-header/notification-center"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

function ThemeToggle() {
  const { setTheme } = useTheme()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme("light")}>
          Light
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>
          Dark
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>
          System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

type StickyHeaderRightNavProps = {
  onOpenFeedback?: () => void
}

export function StickyHeaderRightNav({
  onOpenFeedback,
}: StickyHeaderRightNavProps) {
  return (
    <div className="flex items-center gap-2 pr-1">
      {onOpenFeedback ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-icon="inline-start"
          aria-label="Send feedback"
          onClick={onOpenFeedback}
        >
          <MessageSquarePlusIcon className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Feedback</span>
        </Button>
      ) : null}
      <ThemeToggle />
      <NotificationCenter />
    </div>
  )
}
