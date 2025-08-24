"use client"

import * as React from "react"
import { ChevronsUpDown, Plus, Globe } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/admin/layout/sidebar/sidebar"
import { useSiteContext } from "@/contexts/site-context"

export function SiteSwitcherMenu() {
  const { isMobile } = useSidebar()
  const router = useRouter()
  const { currentSite, sites, loading, setCurrentSite } = useSiteContext()

  if (loading) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" disabled>
            <div className="bg-gray-200 flex aspect-square size-8 items-center justify-center rounded-lg animate-pulse">
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <div className="h-4 bg-gray-200 rounded animate-pulse mb-1 w-24"></div>
              <div className="h-3 bg-gray-100 rounded animate-pulse w-16"></div>
            </div>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    )
  }

  if (sites.length === 0) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <Link href="/admin/sites/new">
            <SidebarMenuButton size="lg">
              <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                <Plus className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">Create Site</span>
                <span className="truncate text-xs text-muted-foreground">Get started</span>
              </div>
            </SidebarMenuButton>
          </Link>
        </SidebarMenuItem>
      </SidebarMenu>
    )
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <div className="flex items-center w-full">
          <Link href={currentSite ? `/admin/sites/${currentSite.id}/dashboard` : "/admin"} className="flex-1">
            <SidebarMenuButton
              size="lg"
              className="w-full cursor-pointer"
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg overflow-hidden">
                {currentSite?.settings?.favicon ? (
                  <img 
                    src={currentSite.settings.favicon} 
                    alt={`${currentSite.name} favicon`}
                    className="size-8 object-cover rounded-lg p-0.5"
                  />
                ) : (
                  <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                    <Globe className="size-4" />
                  </div>
                )}
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">
                  {currentSite ? currentSite.name : "Select Site"}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {currentSite ? (currentSite.custom_domain || `${currentSite.subdomain}.domain.com`) : "Choose a site"}
                </span>
              </div>
            </SidebarMenuButton>
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="p-2 hover:bg-muted rounded-md">
                <ChevronsUpDown className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-72 rounded-lg"
              align="start"
              side={isMobile ? "bottom" : "right"}
              sideOffset={4}
            >
              <DropdownMenuLabel className="text-muted-foreground text-xs">
                Your Sites
              </DropdownMenuLabel>
              {sites.map((site, index) => (
                <DropdownMenuItem
                  key={site.id}
                  onClick={() => {
                    setCurrentSite(site)
                    router.push(`/admin/sites/${site.id}/dashboard`)
                  }}
                  className="gap-2 p-2"
                >
                  <div className="flex size-6 items-center justify-center rounded-md overflow-hidden">
                    {site.settings?.favicon ? (
                      <img 
                        src={site.settings.favicon} 
                        alt={`${site.name} favicon`}
                        className="size-6 object-cover rounded-md"
                      />
                    ) : (
                      <div className="flex size-6 items-center justify-center rounded-md border bg-transparent">
                        <Globe className="size-3.5 shrink-0" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium">{site.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {site.custom_domain || `${site.subdomain}.domain.com`}
                    </div>
                  </div>
                  {index < 9 && (
                    <DropdownMenuShortcut>⌘{index + 1}</DropdownMenuShortcut>
                  )}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/admin/sites/new" className="gap-2 p-2">
                  <div className="flex size-6 items-center justify-center rounded-md border bg-transparent">
                    <Plus className="size-4" />
                  </div>
                  <div className="text-muted-foreground font-medium">Add Site</div>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/admin/sites" className="gap-2 p-2">
                  <div className="flex size-6 items-center justify-center rounded-md border bg-transparent">
                    <Globe className="size-4" />
                  </div>
                  <div className="text-muted-foreground font-medium">Manage Sites</div>
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}