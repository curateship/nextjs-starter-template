"use client"

import { createPortal } from "react-dom"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { StickybarTopRightActions, type StickybarFilterMenuConfig, type StickybarSearchConfig, useDashboardHeaderActionsSlot } from "@/components/admin/layout/stickybar/StickybarTopRightActions"
import { cn } from "@/lib/utils/tailwind"

interface DashboardSubheaderProps {
  /** Breadcrumb trail — last item is rendered as the current page (no link) */
  items: Array<{ label: React.ReactNode; href?: string }>
  /** Filter dropdown rendered between breadcrumbs and actions */
  filterMenu?: StickybarFilterMenuConfig
  /** Search input rendered before other dashboard controls */
  search?: StickybarSearchConfig
  /** Optional content rendered before the filter menu (e.g. search inputs) */
  preActions?: React.ReactNode
  /** Optional right-side content (buttons, etc.) */
  actions?: React.ReactNode
  /** Optional content aligned to the far right of the breadcrumb row */
  rightContent?: React.ReactNode
  className?: string
}

/**
 * Full-width breadcrumb row that sits below the StickyHeader.
 * Dashboard controls are rendered into the StickyHeader top-right slot.
 */
export function DashboardSubheader({ items, filterMenu, search, preActions, actions, rightContent, className }: DashboardSubheaderProps) {
  const { slot } = useDashboardHeaderActionsSlot()
  const topRightActions = (search || filterMenu || preActions || actions) ? (
    <StickybarTopRightActions
      className="gap-1 pr-2 sm:gap-3 sm:pr-3"
      search={search}
      preActions={preActions}
      filterMenu={filterMenu}
      rightActions={actions}
    />
  ) : null

  return (
    <>
      {slot && topRightActions ? createPortal(topRightActions, slot) : null}

      <div className={cn("my-3 flex flex-col sm:flex-row sm:items-center sm:justify-between", className)}>
        {/* Left side: breadcrumbs */}
        <Breadcrumb className="min-w-0">
          <BreadcrumbList className="rounded-md text-sm">
            {items.map((item, index) => {
              const isLast = index === items.length - 1
              return (
                <span key={index} className="contents">
                  {index > 0 && <BreadcrumbSeparator />}
                  <BreadcrumbItem>
                    {isLast ? (
                      <BreadcrumbPage>{item.label}</BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink href={item.href || "#"}>{item.label}</BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                </span>
              )
            })}
          </BreadcrumbList>
        </Breadcrumb>
        {rightContent ? (
          <div className="flex max-w-full shrink-0 overflow-x-auto">
            {rightContent}
          </div>
        ) : null}
      </div>
    </>
  )
}
