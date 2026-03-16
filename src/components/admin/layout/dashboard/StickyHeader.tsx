"use client"

import * as React from "react"
import Link from "next/link"
import { cn } from "@/lib/utils/tailwind-class-merger"
import { useSidebar } from "@/components/admin/layout/sidebar/Sidebar"
import { PanelLeft } from "lucide-react"

interface NavLink {
  label: string
  href: string
  active?: boolean
}

interface StickyHeaderProps {
  className?: string
  navLinks?: NavLink[]
  rightActions?: React.ReactNode
}

export function StickyHeader({
  className,
  navLinks,
  rightActions,
}: StickyHeaderProps) {
  const { toggleSidebar } = useSidebar()

  return (
    <header className={cn(
      "sticky top-0 flex h-16 shrink-0 items-center gap-2 border-b bg-sidebar z-50",
      className
    )}>
      <div className="flex items-center justify-between flex-1 px-4 h-full">
        <div className="flex items-center gap-2">
          {/* Sidebar trigger as tab pill */}
          <button
            onClick={toggleSidebar}
            className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-muted text-sm font-medium transition-colors hover:bg-muted-foreground/10"
          >
            <PanelLeft className="h-3.5 w-3.5" />
          </button>

          {/* NavLinks as tab pills */}
          {navLinks && navLinks.length > 0 && (
            <div className="inline-flex h-10 items-center rounded-md bg-muted p-1 gap-1">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "inline-flex items-center justify-center rounded-sm px-3 py-1.5 text-sm font-medium transition-all",
                    link.active
                      ? "bg-background text-foreground shadow-sm"
                      : "hover:bg-background/50"
                  )}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          )}
        </div>

        {rightActions && (
          <div className="flex items-center gap-2">
            {rightActions}
          </div>
        )}
      </div>
    </header>
  )
}
