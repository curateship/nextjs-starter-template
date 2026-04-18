"use client"

import * as React from "react"
import Link from "next/link"
import { cn } from "@/lib/utils/tailwind"
import { useDashboardHeaderActionsSlot } from "@/components/admin/layout/stickybar/StickybarTopRightActions"
import { useSidebar } from "@/components/admin/layout/sidebar/Sidebar"
import { PanelLeft, type LucideIcon } from "lucide-react"
import { getQuickLinkIcon, getQuickLinkIconOrNull } from "@/lib/utils/site-quick-links"

interface NavLink {
  label: string
  href: string
  active?: boolean
  icon?: LucideIcon
  iconName?: string
  external?: boolean
}

interface HeaderNavItem {
  key: string
  label: string
  href?: string
  active?: boolean
  icon?: LucideIcon
  iconName?: string
  external?: boolean
  onClick?: () => void
}

interface StickyHeaderProps {
  className?: string
  navLinks?: NavLink[]
  navContent?: React.ReactNode
  rightActions?: React.ReactNode
}

export function StickyHeader({
  className,
  navLinks,
  navContent,
  rightActions,
}: StickyHeaderProps) {
  const { isMobile, toggleSidebar } = useSidebar()
  const { setSlot } = useDashboardHeaderActionsSlot()
  const headerNavItems: HeaderNavItem[] = [
    ...(isMobile
      ? [
          {
            key: "toggle-sidebar",
            label: "Toggle sidebar",
            icon: PanelLeft,
            onClick: () => toggleSidebar(),
          },
        ]
      : []),
    ...(navLinks?.map((link) => ({
      ...link,
      key: `${link.href}-${link.label}`,
    })) ?? []),
  ]
  const showStandaloneSidebarToggle = isMobile && (Boolean(navContent) || !navLinks?.length)
  const actionsSlotRef = React.useCallback((node: HTMLDivElement | null) => {
    setSlot(node)
  }, [setSlot])

  return (
    <header className={cn(
      "sticky top-0 flex h-16 shrink-0 items-center gap-2 border-b bg-sidebar z-50",
      className
    )}>
      <div className="flex items-center justify-between flex-1 px-4 h-full">
        <div className="flex items-center gap-2">
          {showStandaloneSidebarToggle ? (
            <button
              type="button"
              onClick={toggleSidebar}
              aria-label="Toggle sidebar"
              title="Toggle sidebar"
              className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md bg-muted text-sm font-medium transition-colors hover:bg-muted-foreground/10"
            >
              <PanelLeft className="h-3.5 w-3.5" />
            </button>
          ) : null}

          {navContent}

          {!navContent && headerNavItems.length > 0 && (
            <div className="inline-flex h-8 items-center rounded-md gap-1">
              {headerNavItems.map((item) => {
                const Icon =
                  item.icon ?? (
                    item.iconName
                      ? getQuickLinkIconOrNull(item.iconName)
                      : isMobile
                        ? getQuickLinkIcon()
                        : null
                  )
                const showItemLabel = !isMobile && item.key !== "toggle-sidebar"
                const itemClassName = cn(
                  "inline-flex h-full items-center justify-center px-2.5 text-sm font-medium transition-all",
                  !isMobile && "px-3",
                  isMobile && "bg-muted",
                  item.active
                    ? "bg-muted text-foreground rounded-md"
                    : "hover:bg-muted rounded-md"
                )
                const iconClassName = cn(
                  "flex h-3.5 w-3.5 items-center justify-center",
                  showItemLabel && "mr-1.5"
                )

                if (item.onClick) {
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={item.onClick}
                      aria-label={item.label}
                      title={item.label}
                      className={itemClassName}
                    >
                      {Icon ? (
                        <span className={iconClassName}>
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                      ) : null}
                    </button>
                  )
                }

                if (item.external && item.href) {
                  return (
                    <a
                      key={item.key}
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={!showItemLabel ? item.label : undefined}
                      title={!showItemLabel ? item.label : undefined}
                      className={itemClassName}
                    >
                      {Icon && (
                        <span className={iconClassName}>
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                      )}
                      {showItemLabel ? item.label : null}
                    </a>
                  )
                }

                return item.href ? (
                  <Link
                    key={item.key}
                    href={item.href}
                    aria-label={!showItemLabel ? item.label : undefined}
                    title={!showItemLabel ? item.label : undefined}
                    className={itemClassName}
                  >
                    {Icon && (
                      <span className={iconClassName}>
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                    )}
                    {showItemLabel ? item.label : null}
                  </Link>
                ) : null
              })}
            </div>
          )}
        </div>

        {/* Right side: page-specific actions */}
        <div className="flex items-center gap-2 pr-1">
          <div ref={actionsSlotRef} className="flex items-center gap-2" />
          {rightActions}
        </div>
      </div>
    </header>
  )
}
