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

  const containerStyle = siteWidth === 'custom'
    ? { maxWidth: `${customWidth || 1152}px` }
    : undefined
  const containerClassName = siteWidth === 'custom'
    ? "mx-auto px-6 pt-4"
    : "px-6 pt-4"

  return (
    <div className={containerClassName} style={containerStyle}>
      <Breadcrumb>
        <BreadcrumbList className="h-8 gap-2 rounded-md text-sm">
          {items.map((item, index) => {
            const isLast = index === items.length - 1

            return (
              <span key={`${item.label}-${index}`} className="contents">
                {index > 0 && <BreadcrumbSeparator />}
                <BreadcrumbItem>
                  {item.href && !isLast ? (
                    <BreadcrumbLink href={item.href}>{item.label}</BreadcrumbLink>
                  ) : (
                    <BreadcrumbPage>{item.label}</BreadcrumbPage>
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
