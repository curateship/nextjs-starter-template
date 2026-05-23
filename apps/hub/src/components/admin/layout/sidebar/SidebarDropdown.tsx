"use client"

import * as React from "react"
import { ChevronRight, type LucideIcon } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/admin/layout/sidebar/Sidebar"
import {
  isExternalAdminSidebarHref,
  sanitizeAdminSidebarHref,
} from "@/lib/utils/admin-sidebar"

type SidebarDropdownChild = {
  id?: string
  title: string
  url: string
  icon?: LucideIcon
  activePaths?: string[]
}

type SidebarDropdownProject = {
  id?: string
  name: string
  url: string
  icon: LucideIcon
  activePaths?: string[]
  items?: SidebarDropdownChild[]
}

function stripQuery(url: string) {
  return url.split("?")[0]
}

function isPathActive(pathname: string, url: string) {
  const cleanUrl = stripQuery(url).trim()
  if (!cleanUrl) return false

  return pathname === cleanUrl || (cleanUrl !== "/" && pathname.startsWith(`${cleanUrl}/`))
}

function isExactPathActive(pathname: string, url: string) {
  const cleanUrl = stripQuery(url).trim()
  return Boolean(cleanUrl) && pathname === cleanUrl
}

function hasActivePath(pathname: string, paths: string[] = []) {
  return paths.some((path) => isPathActive(pathname, path))
}

function getActiveChildId(pathname: string, items: SidebarDropdownChild[] = []) {
  return items
    .filter((item) => isPathActive(pathname, item.url) || hasActivePath(pathname, item.activePaths))
    .sort((a, b) => b.url.length - a.url.length)[0]?.url
}

const SidebarLink = React.forwardRef<HTMLAnchorElement, React.ComponentPropsWithoutRef<"a"> & {
  href: string
}>(function SidebarLink({
  href,
  children,
  ...props
}, ref) {
  const safeHref = sanitizeAdminSidebarHref(href)

  if (isExternalAdminSidebarHref(safeHref)) {
    return (
      <a ref={ref} href={safeHref} target="_blank" rel="noopener noreferrer" {...props}>
        {children}
      </a>
    )
  }

  return (
    <Link ref={ref} href={safeHref || "#"} {...props}>
      {children}
    </Link>
  )
})

export function SidebarDropdown({
  id,
  projects,
  title,
}: {
  id: string
  projects: SidebarDropdownProject[]
  title?: string
}) {
  const pathname = usePathname()
  const { state, setOpenMobile } = useSidebar()
  const storageKey = `hub-sidebar-section-${id}`
  const [open, setOpen] = React.useState(true)

  const handleNavClick = () => {
    setOpenMobile(false)
  }
  React.useEffect(() => {
    setOpen(window.localStorage.getItem(storageKey) !== "closed")
  }, [storageKey])
  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen)
      window.localStorage.setItem(storageKey, nextOpen ? "open" : "closed")
    },
    [storageKey]
  )

  return (
    <Collapsible open={open} onOpenChange={handleOpenChange}>
      <SidebarGroup className="px-2 py-0">
        <SidebarGroupLabel
          asChild
          className="group/section-label cursor-pointer justify-between pr-1"
        >
          <CollapsibleTrigger>
            <span className="truncate">{title || "Admin"}</span>
            <ChevronRight className="opacity-0 transition-[opacity,transform] duration-200 group-hover/section-label:opacity-100 group-focus-visible/section-label:opacity-100 group-data-[state=open]/section-label:rotate-90" />
          </CollapsibleTrigger>
        </SidebarGroupLabel>
        <CollapsibleContent className="pb-2">
          <SidebarMenu>
        {projects.map((item) => {
          const hasChildren = Boolean(item.items?.length)
          const activeChildUrl = getActiveChildId(pathname, item.items)
          const hasActiveChild = Boolean(activeChildUrl)
          const isActive = hasChildren
            ? isExactPathActive(pathname, item.url) || hasActivePath(pathname, item.activePaths)
            : isPathActive(pathname, item.url) || hasActivePath(pathname, item.activePaths)
          const isParentActive = isActive || hasActiveChild

          return (
            <Collapsible
              key={item.id || item.name}
              asChild
              className="group/collapsible"
            >
              <SidebarMenuItem>
                <div
                  data-active={isParentActive}
                  className="flex w-full items-center rounded-md transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground"
                >
                  <SidebarMenuButton
                    asChild
                    tooltip={item.name}
                    isActive={isParentActive}
                    className="flex-1 hover:bg-transparent active:bg-transparent data-[active=true]:bg-transparent data-[state=open]:hover:bg-transparent"
                  >
                    <SidebarLink href={item.url} onClick={handleNavClick}>
                      <item.icon />
                      <span>{item.name}</span>
                    </SidebarLink>
                  </SidebarMenuButton>
                  {state === "expanded" && hasChildren ? (
                    <CollapsibleTrigger asChild>
                      <button
                        type="button"
                        className="rounded-md p-2 opacity-0 transition-[opacity,color] hover:bg-transparent group-hover/collapsible:opacity-100 focus-visible:opacity-100"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <ChevronRight className="h-4 w-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                        <span className="sr-only">Toggle {item.name}</span>
                      </button>
                    </CollapsibleTrigger>
                  ) : null}
                </div>
                {hasChildren ? (
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {item.items?.map((subItem) => (
                        <SidebarMenuSubItem key={subItem.id || subItem.title}>
                          <SidebarMenuSubButton
                            asChild
                            isActive={subItem.url === activeChildUrl}
                          >
                            <SidebarLink href={subItem.url} onClick={handleNavClick}>
                              {subItem.icon ? <subItem.icon /> : null}
                              <span>{subItem.title}</span>
                            </SidebarLink>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                ) : null}
              </SidebarMenuItem>
            </Collapsible>
          )
        })}
          </SidebarMenu>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  )
}
