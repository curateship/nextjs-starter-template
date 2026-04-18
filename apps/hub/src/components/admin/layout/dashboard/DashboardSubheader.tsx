"use client"

import { createPortal } from "react-dom"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/admin/layout/dashboard/breadcrumb"
import { StickybarTopRightActions, type StickybarTabsConfig, useDashboardHeaderActionsSlot } from "@/components/admin/layout/stickybar/StickybarTopRightActions"
import { cn } from "@/lib/utils/tailwind"

interface DashboardSubheaderProps {
  /** Breadcrumb trail — last item is rendered as the current page (no link) */
  items: Array<{ label: React.ReactNode; href?: string }>
  /** Filter tabs rendered between breadcrumbs and actions */
  tabs?: StickybarTabsConfig
  /** Optional content rendered before tabs (e.g. filter dropdowns) */
  preActions?: React.ReactNode
  /** Optional right-side content (buttons, etc.) */
  actions?: React.ReactNode
  className?: string
}

/**
 * Full-width breadcrumb row that sits below the StickyHeader.
 * Dashboard controls are rendered into the StickyHeader top-right slot.
 */
export function DashboardSubheader({ items, tabs, preActions, actions, className }: DashboardSubheaderProps) {
  const { slot } = useDashboardHeaderActionsSlot()
  const topRightActions = (tabs || preActions || actions) ? (
    <StickybarTopRightActions
      className="gap-1 pr-2 sm:gap-3 sm:pr-3"
      preActions={preActions}
      tabs={tabs}
      rightActions={actions}
    />
  ) : null

  return (
    <>
      {slot && topRightActions ? createPortal(topRightActions, slot) : null}

      <div className={cn("flex items-center mb-6 mx-4 mt-2", className)}>
        {/* Left side: breadcrumbs */}
        <Breadcrumb>
          <BreadcrumbList className="h-8 gap-2 rounded-md text-sm">
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
      </div>
    </>
  )
}
