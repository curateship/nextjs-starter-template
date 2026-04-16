"use client"

import * as React from "react"
import Link from "next/link"
import { cn } from "@/lib/utils/tailwind"
import { useSidebar } from "@/components/admin/layout/sidebar/Sidebar"
import { BarChart3, Blocks, FileText, PanelLeft, Settings2, type LucideIcon } from "lucide-react"
import { AdminThemeToggle } from "@/components/ui/admin-theme-toggle"
import { getQuickLinkIcon, getQuickLinkIconOrNull } from "@/lib/utils/site-quick-links"
import { Button } from "@/components/ui/button"
import { useSiteSwitcher } from "@/components/admin/providers/site-switcher-provider"
import { usePathname } from "next/navigation"

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
  const { currentSite } = useSiteSwitcher()
  const pathname = usePathname()
  const newsletterSettingsHref = currentSite ? `/admin/sites/${currentSite.id}/settings/newsletters` : null
  const emailSettingsHref = currentSite ? `/admin/sites/${currentSite.id}/settings?tab=email` : null
  const isNewsletterSection = Boolean(navLinks?.some((link) => link.href.startsWith("/admin/newsletters")))
  const isPlatformEmailSection = Boolean(navLinks?.some((link) => link.href.startsWith("/admin/platforms/emails")))
  const isProductSection = Boolean(navLinks?.some((link) => link.href.startsWith("/admin/products") || link.href.startsWith("/admin/orders")))
  const isDirectorySection = Boolean(navLinks?.some((link) => link.href.startsWith("/admin/directories")))
  const productAnalyticsActive = pathname.startsWith("/admin/products/analytics")
  const directoryCustomBlocksActive = pathname.startsWith("/admin/directories/custom-blocks")
  const directoryTemplatesActive = pathname.startsWith("/admin/directories/templates")
  const showNewsletterTemplatesButton = isNewsletterSection
  const showNewsletterSettingsButton = Boolean(newsletterSettingsHref) && isNewsletterSection
  const showEmailSettingsButton = Boolean(emailSettingsHref) && isPlatformEmailSection
  const newsletterTemplatesActive = pathname.startsWith("/admin/newsletters/templates")
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

        {/* Right side: page-specific actions + theme toggle */}
        <div className="flex items-center gap-2 pr-1">
          {rightActions}
          {isProductSection && (
            <Button variant={productAnalyticsActive ? "default" : "outline"} asChild size="sm">
              <Link href="/admin/products/analytics">
                <BarChart3 className="h-4 w-4" />
                Analytics
              </Link>
            </Button>
          )}
          {isDirectorySection && (
            <Button variant={directoryCustomBlocksActive ? "default" : "outline"} asChild size="sm">
              <Link href="/admin/directories/custom-blocks">
                <Blocks className="h-4 w-4" />
                Custom Blocks
              </Link>
            </Button>
          )}
          {isDirectorySection && (
            <Button variant={directoryTemplatesActive ? "default" : "outline"} asChild size="sm">
              <Link href="/admin/directories/templates">
                <FileText className="h-4 w-4" />
                Templates
              </Link>
            </Button>
          )}
          {showNewsletterTemplatesButton && (
            <Button variant={newsletterTemplatesActive ? "default" : "outline"} asChild size="sm">
              <Link href="/admin/newsletters/templates">
                <FileText className="h-4 w-4" />
                Templates
              </Link>
            </Button>
          )}
          {showNewsletterSettingsButton && newsletterSettingsHref && (
            <Button variant="outline" asChild size="sm">
              <Link href={newsletterSettingsHref}>
                <Settings2 className="h-4 w-4" />
                Settings
              </Link>
            </Button>
          )}
          {showEmailSettingsButton && emailSettingsHref && (
            <Button variant="outline" asChild size="sm">
              <Link href={emailSettingsHref}>
                <Settings2 className="h-4 w-4" />
                Email Settings
              </Link>
            </Button>
          )}
          <AdminThemeToggle />
        </div>
      </div>
    </header>
  )
}
