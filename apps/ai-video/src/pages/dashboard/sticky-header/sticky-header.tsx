"use client"

import * as React from "react"
import { PanelLeftIcon } from "lucide-react"

import { useIsMobile } from "@/hooks/use-mobile"
import { Button } from "@/components/ui/button"
import { StickyHeaderRightNav } from "@/pages/dashboard/sticky-header/sticky-header-right-nav"
import {
  StickyHeaderLeftNav,
  type StickyHeaderLeftNavLink,
} from "@/pages/dashboard/sticky-header/sticky-header-left-nav"
import { useSidebar } from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"
import type { ShellTopRightNavigationItem } from "@/lib/ai-video"

type StickyHeaderProps = {
  className?: string
  navLinks?: StickyHeaderLeftNavLink[]
  navContent?: React.ReactNode
  rightNavItems: ShellTopRightNavigationItem[]
  onOpenFeedback?: () => void
  onOpenFeedbackThread?: (feedbackId: string) => void
}

export function StickyHeader({
  className,
  navLinks,
  navContent,
  rightNavItems,
  onOpenFeedback,
  onOpenFeedbackThread,
}: StickyHeaderProps) {
  const { toggleSidebar } = useSidebar()
  const isMobile = useIsMobile()

  return (
    <header
      className={cn(
        "sticky top-0 z-50 flex h-16 shrink-0 items-center gap-2 border-b border-sidebar-border bg-sidebar",
        className
      )}
    >
      <div className="flex h-full flex-1 items-center justify-between px-4">
        <div className="flex items-center gap-2">
          {isMobile ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-[30px] gap-1.5"
              aria-label="Toggle sidebar"
              onClick={toggleSidebar}
            >
              <PanelLeftIcon className="h-3.5 w-3.5" />
            </Button>
          ) : null}

          {navContent}

          {!navContent && navLinks && navLinks.length > 0 && (
            <StickyHeaderLeftNav navLinks={navLinks} />
          )}
        </div>
        <StickyHeaderRightNav
          items={rightNavItems}
          onOpenFeedback={onOpenFeedback}
          onOpenFeedbackThread={onOpenFeedbackThread}
        />
      </div>
    </header>
  )
}
