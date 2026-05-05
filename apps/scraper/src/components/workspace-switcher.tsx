import type { ReactNode } from "react"
import { Link } from "@tanstack/react-router"

import {
  SidebarMenu,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

export function WorkspaceSwitcher({
  name,
  logo,
  plan,
}: {
  name: string
  logo: ReactNode
  plan: string
}) {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <div className="relative flex min-h-8 items-center py-2">
          <Link
            to="/"
            className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-sidebar-primary text-sidebar-primary-foreground"
          >
            {logo}
          </Link>
          <div className="absolute left-10 right-0 flex min-w-0 items-center overflow-hidden whitespace-nowrap transition-opacity duration-250 ease-linear group-data-[collapsible=icon]:pointer-events-none group-data-[collapsible=icon]:opacity-0">
            <Link to="/" className="grid min-w-0 flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{name}</span>
              <span className="truncate text-xs text-muted-foreground">{plan}</span>
            </Link>
          </div>
        </div>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
