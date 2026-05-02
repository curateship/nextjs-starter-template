"use client"

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

function isPathActive(pathname: string, url: string) {
  return pathname === url || pathname.startsWith(`${url}/`)
}

function isExactPathActive(pathname: string, url: string) {
  return pathname === url
}

function getActiveChildUrl(pathname: string, items: { url: string }[] = []) {
  return items
    .filter((item) => isPathActive(pathname, item.url))
    .sort((a, b) => b.url.length - a.url.length)[0]?.url
}

export function SidebarDropdown({
  projects,
  title,
}: {
  projects: {
    name: string
    url: string
    icon: LucideIcon
    items?: {
      title: string
      url: string
    }[]
  }[]
  title?: string
}) {
  const pathname = usePathname()
  const { state, setOpenMobile } = useSidebar()

  const handleNavClick = () => {
    setOpenMobile(false)
  }

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{title || "Admin"}</SidebarGroupLabel>
      <SidebarMenu>
        {projects.map((item) => {
          const hasChildren = Boolean(item.items?.length)
          const activeChildUrl = getActiveChildUrl(pathname, item.items)
          const hasActiveChild = Boolean(activeChildUrl)
          const isActive = isExactPathActive(pathname, item.url)
          const isParentActive = isActive || hasActiveChild

          return (
            <Collapsible
              key={item.name}
              asChild
              defaultOpen={isParentActive}
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
                    <Link href={item.url} onClick={handleNavClick}>
                      <item.icon />
                      <span>{item.name}</span>
                    </Link>
                  </SidebarMenuButton>
                  {state === "expanded" && hasChildren ? (
                    <CollapsibleTrigger asChild>
                      <button
                        type="button"
                        className="rounded-md p-2 transition-colors hover:bg-transparent"
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
                        <SidebarMenuSubItem key={subItem.title}>
                          <SidebarMenuSubButton
                            asChild
                            isActive={subItem.url === activeChildUrl}
                          >
                            <Link href={subItem.url} onClick={handleNavClick}>
                              <span>{subItem.title}</span>
                            </Link>
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
    </SidebarGroup>
  )
}
