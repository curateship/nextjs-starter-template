"use client"

import * as React from "react"
import Link from "next/link"
import { cn } from "@/lib/utils/tailwind-class-merger"
import { useSidebar } from "@/components/admin/layout/sidebar/Sidebar"
import { PanelLeft, type LucideIcon } from "lucide-react"
import { AdminThemeToggle } from "@/components/ui/admin-theme-toggle"
import { getQuickLinkIcon } from "@/lib/utils/site-quick-links"

interface NavLink {
  label: string
  href: string
  active?: boolean
  icon?: LucideIcon
  iconName?: string
  external?: boolean
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
            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-muted text-sm font-medium transition-colors hover:bg-muted-foreground/10"
          >
            <PanelLeft className="h-3.5 w-3.5" />
          </button>

          {/* NavLinks as tab pills */}
          {navLinks && navLinks.length > 0 && (
            <div className="inline-flex h-8 items-center rounded-md gap-1">
              {navLinks.map((link) => {
                const Icon = link.icon ?? (link.iconName ? getQuickLinkIcon(link.iconName) : null)

                return link.external ? (
                  <a
                    key={`${link.href}-${link.label}`}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      "inline-flex h-full items-center justify-center px-3 text-sm font-medium transition-all",
                      link.active
                        ? "bg-muted text-foreground rounded-md"
                        : "hover:bg-muted/50 rounded-md"
                    )}
                  >
                    {Icon && <Icon className="h-3.5 w-3.5 mr-1.5" />}
                    {link.label}
                  </a>
                ) : (
                  <Link
                    key={`${link.href}-${link.label}`}
                    href={link.href}
                    className={cn(
                      "inline-flex h-full items-center justify-center px-3 text-sm font-medium transition-all",
                      link.active
                        ? "bg-muted text-foreground rounded-md"
                        : "hover:bg-muted/50 rounded-md"
                    )}
                  >
                    {Icon && <Icon className="h-3.5 w-3.5 mr-1.5" />}
                    {link.label}
                  </Link>
                )
              })}
            </div>
          )}
        </div>

        {/* Right side: page-specific actions + theme toggle */}
        <div className="flex items-center gap-2 pr-3">
          {rightActions}
          <AdminThemeToggle />
        </div>
      </div>
    </header>
  )
}
