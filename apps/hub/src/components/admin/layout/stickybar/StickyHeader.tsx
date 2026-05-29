"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronDown, Monitor, Moon, MoreVertical, PanelLeft, Sun, SunMoon, type LucideIcon } from "lucide-react"
import { useTheme } from "next-themes"
import { cn } from "@/lib/utils/tailwind"
import { NotificationCenter } from "@/components/admin/layout/stickybar/NotificationCenter"
import { useDashboardHeaderActionsSlot } from "@/components/admin/layout/stickybar/StickybarTopRightActions"
import { useSidebar } from "@/components/admin/layout/sidebar/Sidebar"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import {
  getAdminSidebarSiteIdFromPathname,
  getAdminSidebarStickyNavLinks,
  sanitizeAdminSidebarHref,
} from "@/lib/utils/admin-sidebar"
import { renderQuickLinkIcon } from "@/lib/utils/site-quick-links"

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
  rightActions?: React.ReactNode
}

export function StickyHeader({
  className,
  navLinks,
  rightActions,
}: StickyHeaderProps) {
  const { isMobile, toggleSidebar } = useSidebar()
  const pathname = usePathname()
  const { setTheme } = useTheme()
  const { currentSite, sites } = useSiteSwitcher()
  const { setSlot, setMobileOverflowSlot } = useDashboardHeaderActionsSlot()
  const routeSiteId = getAdminSidebarSiteIdFromPathname(pathname)
  const routeSite = routeSiteId
    ? sites.find((site) => site.id === routeSiteId) ?? null
    : null
  const headerSite = routeSite ?? currentSite
  const sidebarNavLinks = React.useMemo(
    () => getAdminSidebarStickyNavLinks(headerSite?.settings?.admin_sidebar, {
      siteId: headerSite?.id ?? routeSiteId,
      pathname,
    }),
    [headerSite?.id, headerSite?.settings?.admin_sidebar, pathname, routeSiteId]
  )
  const resolvedNavLinks = sidebarNavLinks.length > 0
    ? sidebarNavLinks
    : navLinks
  const navItems: HeaderNavItem[] = resolvedNavLinks?.map((link) => ({
    ...link,
    key: `${link.href}-${link.label}`,
  })) ?? []
  const actionsSlotRef = React.useCallback((node: HTMLDivElement | null) => {
    setSlot(node)
  }, [setSlot])
  const mobileOverflowSlotRef = React.useCallback((node: HTMLDivElement | null) => {
    setMobileOverflowSlot(node)
  }, [setMobileOverflowSlot])
  const renderNavIcon = (item: HeaderNavItem, className?: string) => {
    if (item.icon) {
      const Icon = item.icon
      return <Icon className={className ?? "h-3.5 w-3.5"} />
    }

    return renderQuickLinkIcon(item.iconName, className ?? "h-3.5 w-3.5")
  }
  const renderNavItem = (item: HeaderNavItem, showLabel: boolean) => {
    const safeHref = item.href ? sanitizeAdminSidebarHref(item.href) : ""
    const itemClassName = cn(
      "inline-flex items-center justify-center px-2.5 text-sm font-medium transition-all",
      isMobile ? "h-8" : "h-full",
      !isMobile && "px-3",
      isMobile && "bg-muted",
      item.active
        ? "bg-muted text-foreground rounded-md"
        : "hover:bg-muted rounded-md"
    )
    const icon = renderNavIcon(item)

    if (item.external && safeHref) {
      return (
        <a
          key={item.key}
          href={safeHref}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={!showLabel ? item.label : undefined}
          title={!showLabel ? item.label : undefined}
          className={itemClassName}
        >
          {icon ? <span className={cn("flex h-3.5 w-3.5 items-center justify-center", showLabel && "mr-1.5")}>{icon}</span> : null}
          {showLabel ? item.label : null}
        </a>
      )
    }

    return safeHref ? (
      <Link
        key={item.key}
        href={safeHref}
        aria-label={!showLabel ? item.label : undefined}
        title={!showLabel ? item.label : undefined}
        className={itemClassName}
      >
        {icon ? <span className={cn("flex h-3.5 w-3.5 items-center justify-center", showLabel && "mr-1.5")}>{icon}</span> : null}
        {showLabel ? item.label : null}
      </Link>
    ) : null
  }
  const activeNavItem = navItems.find((item) => item.active) ?? navItems[0]

  return (
    <header className={cn(
      "sticky top-0 flex h-16 shrink-0 items-center gap-2 border-b bg-sidebar z-50",
      className
    )}>
      <div className="flex items-center justify-between flex-1 px-4 h-full">
        <div className="flex items-center gap-2">
          {isMobile ? (
            <button
              type="button"
              onClick={toggleSidebar}
              aria-label="Toggle sidebar"
              title="Toggle sidebar"
              className="inline-flex h-8 items-center justify-center rounded-md bg-muted px-2.5 text-sm font-medium transition-all hover:bg-muted"
            >
              <span className="flex h-3.5 w-3.5 items-center justify-center">
                <PanelLeft className="h-3.5 w-3.5" />
              </span>
            </button>
          ) : null}

          {isMobile && navItems.length === 1 ? renderNavItem(navItems[0], true) : null}

          {isMobile && navItems.length > 1 && activeNavItem ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 gap-1.5 bg-muted hover:bg-muted">
                  {renderNavIcon(activeNavItem) ? (
                    <span className="flex h-3.5 w-3.5 items-center justify-center">
                      {renderNavIcon(activeNavItem)}
                    </span>
                  ) : null}
                  <span className="text-sm">{activeNavItem.label}</span>
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {navItems.map((item) => {
                  const safeHref = item.href ? sanitizeAdminSidebarHref(item.href) : ""
                  const content = (
                    <>
                      {renderNavIcon(item) ? <span>{renderNavIcon(item, "h-4 w-4")}</span> : null}
                      {item.label}
                    </>
                  )

                  return item.external && safeHref ? (
                    <DropdownMenuItem key={item.key} asChild className={cn(item.active && "bg-accent text-accent-foreground")}>
                      <a href={safeHref} target="_blank" rel="noopener noreferrer">
                        {content}
                      </a>
                    </DropdownMenuItem>
                  ) : safeHref ? (
                    <DropdownMenuItem key={item.key} asChild className={cn(item.active && "bg-accent text-accent-foreground")}>
                      <Link href={safeHref}>{content}</Link>
                    </DropdownMenuItem>
                  ) : null
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}

          {!isMobile && navItems.length > 0 && (
            <div className="inline-flex h-8 items-center rounded-md gap-1">
              {navItems.map((item) => renderNavItem(item, true))}
            </div>
          )}
        </div>

        {/* Right side: page-specific actions */}
        <div className="flex shrink-0 items-center gap-1 pr-1">
          <div ref={actionsSlotRef} className="flex shrink-0 items-center gap-1" />
          {rightActions}
          <NotificationCenter />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label="Theme"
                title="Theme"
                className="hidden sm:inline-flex"
              >
                <SunMoon className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setTheme("light")}>
                <Sun />
                Light
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme("dark")}>
                <Moon />
                Dark
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme("system")}>
                <Monitor />
                System
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label="More actions"
                title="More actions"
                className="sm:hidden"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div ref={mobileOverflowSlotRef} />
              <DropdownMenuItem onClick={() => setTheme("light")}>
                <Sun />
                Light
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme("dark")}>
                <Moon />
                Dark
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme("system")}>
                <Monitor />
                System
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}
