import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import type { FrontendBreadcrumbItem } from "@/lib/actions/categories/frontend-breadcrumb-actions"

interface FrontendBreadcrumbsProps {
  items?: FrontendBreadcrumbItem[]
  siteWidth?: 'full' | 'custom'
  customWidth?: number
}

export function FrontendBreadcrumbs({
  items = [],
  siteWidth = 'custom',
  customWidth,
}: FrontendBreadcrumbsProps) {
  if (items.length === 0) return null
  const breadcrumbItems = items[0]?.label?.toLowerCase() === 'home'
    ? items
    : [{ label: 'Home', href: '/' }, ...items]

  const containerStyle = siteWidth === 'custom'
    ? { maxWidth: `${customWidth || 1152}px` }
    : undefined
  const containerClassName = siteWidth === 'custom'
    ? "mx-auto px-6 py-4"
    : "px-6 py-4"

  return (
    <div className={containerClassName} style={containerStyle}>
      <Breadcrumb>
        <BreadcrumbList className="flex-nowrap gap-2 overflow-hidden rounded-md text-sm whitespace-nowrap">
          {breadcrumbItems.map((item, index) => {
            const isLast = index === breadcrumbItems.length - 1

            return (
              <span key={`${item.label}-${index}`} className="contents">
                {index > 0 && <BreadcrumbSeparator className="shrink-0" />}
                <BreadcrumbItem className={isLast ? "min-w-0 shrink" : "shrink-0"}>
                  {item.href && !isLast ? (
                    <BreadcrumbLink href={item.href}>{item.label}</BreadcrumbLink>
                  ) : (
                    <BreadcrumbPage className="block truncate">{item.label}</BreadcrumbPage>
                  )}
                </BreadcrumbItem>
              </span>
            )
          })}
        </BreadcrumbList>
      </Breadcrumb>
    </div>
  )
}
