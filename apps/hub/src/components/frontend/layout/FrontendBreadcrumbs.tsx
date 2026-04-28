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
    ? "mx-auto px-6 pt-4 md:pt-6 pb-2"
    : "px-6 pt-4 md:pt-6 pb-6"

  return (
    <div className={containerClassName} style={containerStyle}>
      <Breadcrumb>
        <BreadcrumbList className="gap-2 rounded-md text-sm">
          {breadcrumbItems.map((item, index) => {
            const isLast = index === breadcrumbItems.length - 1

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
