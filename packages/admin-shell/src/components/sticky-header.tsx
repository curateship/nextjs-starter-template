"use client"

import * as React from "react"
import { PanelLeftIcon } from "lucide-react"

import { AdminThemeToggle } from "./admin-theme-toggle"
import { useSidebar } from "./ui/sidebar"
import { cn } from "../lib/utils"

type NavLink = {
  label: string
  active?: boolean
  href?: string
  icon?: React.ReactNode
  external?: boolean
}

type StickyHeaderProps = {
  className?: string
  navLinks?: NavLink[]
  navContent?: React.ReactNode
  rightActions?: React.ReactNode
}

function shouldUseAnchor(href?: string) {
  if (!href) {
    return false
  }

  return (
    href.startsWith("#") ||
    href.startsWith("http://") ||
    href.startsWith("https://") ||
    href.startsWith("mailto:")
  )
}

export function StickyHeader({
  className,
  navLinks,
  navContent,
  rightActions,
}: StickyHeaderProps) {
  const { toggleSidebar } = useSidebar()

  return (
    <header
      className={cn(
        "sticky top-0 z-50 flex h-16 shrink-0 items-center gap-2 border-b bg-sidebar",
        className
      )}
    >
      <div className="flex h-full flex-1 items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleSidebar}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-muted text-sm font-medium transition-colors hover:bg-muted/70"
          >
            <PanelLeftIcon className="h-3.5 w-3.5" />
            <span className="sr-only">Toggle sidebar</span>
          </button>

          {navContent}

          {!navContent && navLinks && navLinks.length > 0 && (
            <div className="inline-flex h-8 items-center gap-1 rounded-md">
              {navLinks.map((link) => (
                shouldUseAnchor(link.href) ? (
                  <a
                    key={`${link.label}-${link.href}`}
                    href={link.href}
                    target={link.external ? "_blank" : undefined}
                    rel={link.external ? "noreferrer" : undefined}
                    className={cn(
                      "inline-flex h-full items-center justify-center rounded-md px-3 text-sm font-medium transition-all",
                      link.active
                        ? "bg-muted text-foreground"
                        : "hover:bg-muted/50"
                    )}
                  >
                    {link.icon ? (
                      <span className="mr-1.5 flex h-3.5 w-3.5 items-center justify-center">
                        {link.icon}
                      </span>
                    ) : null}
                    {link.label}
                  </a>
                ) : (
                  <button
                    key={`${link.label}-${link.href}`}
                    type="button"
                    title={link.href}
                    className={cn(
                      "inline-flex h-full items-center justify-center rounded-md px-3 text-sm font-medium transition-all",
                      link.active
                        ? "bg-muted text-foreground"
                        : "hover:bg-muted/50"
                    )}
                  >
                    {link.icon ? (
                      <span className="mr-1.5 flex h-3.5 w-3.5 items-center justify-center">
                        {link.icon}
                      </span>
                    ) : null}
                    {link.label}
                  </button>
                )
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 pr-1">
          {rightActions}
          <AdminThemeToggle />
        </div>
      </div>
    </header>
  )
}
