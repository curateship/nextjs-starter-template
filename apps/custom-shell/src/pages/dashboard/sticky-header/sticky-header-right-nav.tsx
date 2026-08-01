"use client"

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
import {
  normalizeTopRightNavigation,
  type ShellTopRightNavigationItem,
} from "@/lib/custom-shell"

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
  items?: ShellTopRightNavigationItem[]
  unreadNotifications?: number
  onOpenFeedback?: () => void
  onOpenFeedbackThread?: (feedbackId: string) => void
}

export function StickyHeaderRightNav({
  items,
  unreadNotifications,
  onOpenFeedback,
  onOpenFeedbackThread,
}: StickyHeaderRightNavProps) {
  const navItems = normalizeTopRightNavigation(items)

  return (
    <div className="flex items-center gap-2 pr-1">
      {navItems.map((item) => {
        if (!item.visible) return null

        if (item.id === "feedback") {
          return onOpenFeedback ? (
            <Button
              key={item.id}
              type="button"
              variant="outline"
              data-icon="inline-start"
              aria-label="Send feedback"
              onClick={onOpenFeedback}
            >
              <MessageSquarePlusIcon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Feedback</span>
            </Button>
          ) : null
        }

        if (item.id === "theme") {
          return <ThemeToggle key={item.id} />
        }

        return (
          <NotificationCenter
            key={item.id}
            initialUnreadCount={unreadNotifications ?? 0}
            onOpenFeedback={onOpenFeedbackThread}
          />
        )
      })}
    </div>
  )
}
