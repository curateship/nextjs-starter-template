import { HomeIcon } from "lucide-react"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/admin/layout/dashboard/breadcrumb"
import { cn } from "@/lib/utils/tailwind-class-merger"

interface DashboardSubheaderProps {
  /** Breadcrumb trail — last item is rendered as the current page (no link) */
  items: Array<{ label: React.ReactNode; href?: string }>
  /** Optional right-side content (buttons, tabs, filters, etc.) */
  actions?: React.ReactNode
  className?: string
}

/**
 * Full-width breadcrumb row that sits below the StickyHeader.
 * Renders Home icon automatically as the first breadcrumb item.
 */
export function DashboardSubheader({ items, actions, className }: DashboardSubheaderProps) {
  return (
    <div className={cn("flex items-center justify-between mb-6 mx-4 mt-2", className)}>
      <Breadcrumb>
        <BreadcrumbList className="h-8 gap-2 rounded-md text-sm">
          {/* Home icon — always first */}
          <BreadcrumbItem>
            <BreadcrumbLink href="/admin">
              <HomeIcon className="size-4" />
              <span className="sr-only">Home</span>
            </BreadcrumbLink>
          </BreadcrumbItem>

          {/* Breadcrumb items */}
          {items.map((item, index) => {
            const isLast = index === items.length - 1
            return (
              <span key={index} className="contents">
                <BreadcrumbSeparator />
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

      {actions}
    </div>
  )
}
