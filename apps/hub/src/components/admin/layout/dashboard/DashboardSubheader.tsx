import { type LucideIcon } from "lucide-react"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/admin/layout/dashboard/breadcrumb"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils/tailwind"

/** Single filter tab definition */
export interface SubheaderTab {
  value: string
  label: string
  icon?: LucideIcon
  count?: number
}

/** Config for the built-in filter tabs */
export interface SubheaderTabsConfig {
  value: string
  onValueChange: (value: string) => void
  items: SubheaderTab[]
}

interface DashboardSubheaderProps {
  /** Breadcrumb trail — last item is rendered as the current page (no link) */
  items: Array<{ label: React.ReactNode; href?: string }>
  /** Filter tabs rendered between breadcrumbs and actions */
  tabs?: SubheaderTabsConfig
  /** Optional content rendered before tabs (e.g. filter dropdowns) */
  preActions?: React.ReactNode
  /** Optional right-side content (buttons, etc.) */
  actions?: React.ReactNode
  className?: string
}

/**
 * Full-width breadcrumb row that sits below the StickyHeader.
 * Optionally renders filter tabs (All/Draft/Published etc.) and action buttons.
 */
export function DashboardSubheader({ items, tabs, preActions, actions, className }: DashboardSubheaderProps) {
  return (
    <div className={cn("flex items-center justify-between mb-6 mx-4 mt-2", className)}>
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

      {/* Right side: pre-actions + filter tabs + action buttons */}
      {(tabs || preActions || actions) && (
        <div className="flex items-center gap-1 sm:gap-3">
          {/* Pre-actions (e.g. filter dropdowns) */}
          {preActions}

          {/* Filter tabs */}
          {tabs && (
            <Tabs value={tabs.value} onValueChange={tabs.onValueChange}>
              <TabsList className="gap-1">
                {tabs.items.map((tab) => (
                  <TabsTrigger key={tab.value} value={tab.value}>
                    {tab.icon && <tab.icon className="h-3.5 w-3.5 mr-1.5" />}
                    {tab.label}{tab.count !== undefined ? ` (${tab.count})` : ""}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}

          {/* Action buttons */}
          {actions}
        </div>
      )}
    </div>
  )
}
