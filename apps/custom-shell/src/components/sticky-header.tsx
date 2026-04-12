"use client"

import * as React from "react"
import { PanelLeftIcon } from "lucide-react"

import { useIsMobile } from "../hooks/use-mobile"
import { LightDarkToggle } from "./light-dark-toggle"
import {
  StickyHeaderLeftNav,
  type StickyHeaderLeftNavLink,
} from "./stickyheader-left-nav"
import { useSidebar } from "./ui/sidebar"
import { cn } from "../lib/utils"

type StickyHeaderProps = {
  className?: string
  navLinks?: StickyHeaderLeftNavLink[]
  navContent?: React.ReactNode
  rightActions?: React.ReactNode
}

export function StickyHeader({
  className,
  navLinks,
  navContent,
  rightActions,
}: StickyHeaderProps) {
  const { toggleSidebar } = useSidebar()
  const isMobile = useIsMobile()

  return (
    <header
      className={cn(
        "sticky top-0 z-50 flex h-16 shrink-0 items-center gap-2 border-b bg-sidebar",
        className
      )}
    >
      <div className="flex h-full flex-1 items-center justify-between px-4">
        <div className="flex items-center gap-2">
          {isMobile ? (
            <button
              type="button"
              onClick={toggleSidebar}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-muted text-sm font-medium transition-colors hover:bg-muted/70"
            >
              <PanelLeftIcon className="h-3.5 w-3.5" />
              <span className="sr-only">Toggle sidebar</span>
            </button>
          ) : null}

          {navContent}

          {!navContent && navLinks && navLinks.length > 0 && (
            <StickyHeaderLeftNav navLinks={navLinks} />
          )}
        </div>
        <div className="flex items-center gap-2 pr-1">
          {rightActions}
          <LightDarkToggle />
        </div>
      </div>
    </header>
  )
}
