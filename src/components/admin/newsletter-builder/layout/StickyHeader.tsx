"use client"

import * as React from "react"
import Link from "next/link"
import { cn } from "@/lib/utils/tailwind-class-merger"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/admin/layout/sidebar/Sidebar"
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
}

export function StickyHeader({
  className,
  breadcrumbItems = [],
  navLinks,
  rightActions,
}: StickyHeaderProps) {
  return (
    <header className={cn(
      "sticky top-0 flex h-16 shrink-0 items-center gap-2 border-b bg-sidebar z-50",
      className
    )}>
      <div className="flex items-center justify-between flex-1 px-4 h-full">
        <div className="flex items-center gap-2">
          <SidebarTrigger className="-ml-1" />
          {breadcrumbItems.length > 0 && (
            <>
              <Separator
                orientation="vertical"
                className="mr-2 h-4"
              />
              <Breadcrumb>
                <BreadcrumbList>
                  {breadcrumbItems.map((item, index) => (
                    <React.Fragment key={index}>
                      <BreadcrumbItem className={index === 0 ? "hidden md:block" : ""}>
                        {item.isPage ? (
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
                        <BreadcrumbSeparator className="hidden md:block" />
                      )}
                    </React.Fragment>
                  ))}
                </BreadcrumbList>
              </Breadcrumb>
            </>
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

        {rightActions && (
          <div className="flex items-center gap-2">
            {rightActions}
          </div>
        )}
      </div>
    </header>
  )
}
