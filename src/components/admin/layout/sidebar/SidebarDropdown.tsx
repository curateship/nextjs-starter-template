"use client"

import { ChevronRight, type LucideIcon } from "lucide-react"
import Link from "next/link"

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
  const { state, setOpenMobile } = useSidebar()

  const handleNavClick = () => {
    setOpenMobile(false)
  }

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{title || "Admin"}</SidebarGroupLabel>
      <SidebarMenu>
        {projects.map((item) => (
          <Collapsible
            key={item.name}
            asChild
            className="group/collapsible"
          >
            <SidebarMenuItem>
              <div className="flex items-center w-full">
                <SidebarMenuButton asChild tooltip={item.name} className="flex-1">
                  <Link href={item.url} onClick={handleNavClick}>
                    <item.icon />
                    <span>{item.name}</span>
                  </Link>
                </SidebarMenuButton>
                {state === "expanded" && item.items && item.items.length > 0 && (
                  <CollapsibleTrigger asChild>
                    <button
                      className="p-2 hover:bg-muted rounded-md"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ChevronRight className="w-4 h-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                    </button>
                  </CollapsibleTrigger>
                )}
              </div>
              <CollapsibleContent>
                <SidebarMenuSub>
                  {item.items?.map((subItem) => (
                    <SidebarMenuSubItem key={subItem.title}>
                      <SidebarMenuSubButton asChild>
                        <Link href={subItem.url} onClick={handleNavClick}>
                          <span>{subItem.title}</span>
                        </Link>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  ))}
                </SidebarMenuSub>
              </CollapsibleContent>
            </SidebarMenuItem>
          </Collapsible>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  )
}
