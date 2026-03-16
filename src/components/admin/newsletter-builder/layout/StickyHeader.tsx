"use client"

import * as React from "react"
import Link from "next/link"
import { cn } from "@/lib/utils/tailwind-class-merger"
import { useSidebar } from "@/components/admin/layout/sidebar/Sidebar"
import { PanelLeft, PanelRight, PanelRightClose, Home } from "lucide-react"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/admin/layout/dashboard/breadcrumb"

interface BreadcrumbItem {
  href?: string
  label: string
  isPage?: boolean
}

interface NavLink {
  label: string
  href: string
  active?: boolean
}

interface StickyHeaderProps {
  className?: string
  breadcrumbItems?: BreadcrumbItem[]
  navLinks?: NavLink[]
  rightActions?: React.ReactNode
  blockListOpen?: boolean
  onToggleBlockList?: () => void
}

export function StickyHeader({
  className,
  breadcrumbItems = [],
  navLinks,
  rightActions,
  blockListOpen,
  onToggleBlockList,
}: StickyHeaderProps) {
  const { toggleSidebar } = useSidebar()

  return (
    <header className={cn(
      "sticky top-0 flex h-16 shrink-0 items-center gap-2 border-b bg-sidebar z-50",
      className
    )}>
      <div className="flex items-center justify-between flex-1 px-4 h-full">
        <div className="flex items-center gap-2">
          <button
            onClick={toggleSidebar}
            className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-muted text-sm font-medium transition-colors hover:bg-muted-foreground/10"
          >
            <PanelLeft className="h-3.5 w-3.5" />
          </button>
          {breadcrumbItems.length > 0 && (
            <Breadcrumb className="w-fit rounded-lg bg-muted px-3 py-2">
              <BreadcrumbList>
                {breadcrumbItems.map((item, index) => (
                  <React.Fragment key={index}>
                    <BreadcrumbItem>
                      {index === 0 ? (
                        <BreadcrumbLink asChild>
                          <Link href={item.href || "#"}>
                            <Home className="size-4" />
                          </Link>
                        </BreadcrumbLink>
                      ) : item.isPage ? (
                        <BreadcrumbPage>{item.label}</BreadcrumbPage>
                      ) : (
                        <BreadcrumbLink asChild>
                          <Link href={item.href || "#"}>
                            {item.label}
                          </Link>
                        </BreadcrumbLink>
                      )}
                    </BreadcrumbItem>
                    {index < breadcrumbItems.length - 1 && (
                      <BreadcrumbSeparator />
                    )}
                  </React.Fragment>
                ))}
              </BreadcrumbList>
            </Breadcrumb>
          )}
        </div>

        {/* Nav Links */}
        {navLinks && navLinks.length > 0 && (
          <div className="flex items-center gap-8 h-full pr-14">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "text-sm font-medium h-full flex items-center border-b-[3px] transition-colors",
                  link.active
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {link.label}
              </Link>
            ))}
          </div>
        )}

        {(rightActions || onToggleBlockList) && (
          <div className="flex items-center gap-2">
            {rightActions}
            {onToggleBlockList && (
              <button
                onClick={onToggleBlockList}
                className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-muted text-sm font-medium transition-colors hover:bg-muted-foreground/10"
              >
                {blockListOpen ? <PanelRightClose className="h-3.5 w-3.5" /> : <PanelRight className="h-3.5 w-3.5" />}
              </button>
            )}
          </div>
        )}
      </div>
    </header>
  )
}
