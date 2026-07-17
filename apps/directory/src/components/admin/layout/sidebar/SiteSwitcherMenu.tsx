"use client"

import * as React from "react"
import ChevronsUpDown from "lucide-react/dist/esm/icons/chevrons-up-down.js"
import Plus from "lucide-react/dist/esm/icons/plus.js"
import Globe from "lucide-react/dist/esm/icons/globe.js"
import ExternalLink from "lucide-react/dist/esm/icons/external-link.js"
import { getSiteUrl } from "@/lib/utils/site-url-generator"
import Link from "@/components/app-link"
import { useRouter } from "@/lib/navigation-client"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/admin/layout/sidebar/Sidebar"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"

const SiteFavicon = React.memo(function SiteFavicon({ favicon, name }: { favicon?: string; name?: string }) {
  if (favicon) {
    return (
      <img
        src={favicon}
        alt={`${name} favicon`}
        width={32}
        height={32}
        className="h-8 w-auto object-contain p-0.5"
      />
    )
  }
  return (
    <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
      <Globe className="size-4" />
    </div>
  )
})

export function SiteSwitcherMenu() {
  const { isMobile } = useSidebar()
  const router = useRouter()
  const { currentSite, sites, loading, setCurrentSite } = useSiteSwitcher()

  if (loading) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" disabled>
            <div className="bg-muted flex aspect-square size-8 items-center justify-center rounded-lg animate-pulse">
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <div className="h-4 bg-muted rounded animate-pulse mb-1 w-24"></div>
              <div className="h-3 bg-muted/60 rounded animate-pulse w-16"></div>
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
          <Link href="/admin/sites?create=1">
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

  const dashboardHref = currentSite ? `/admin/dashboard/${currentSite.id}` : "/admin"

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <div className="flex min-h-8 items-center gap-2 py-2">
          <Link
            href={dashboardHref}
            className="flex h-8 shrink-0 items-center justify-center"
          >
            <SiteFavicon favicon={currentSite?.settings?.favicon} name={currentSite?.name} />
          </Link>
          <div className="flex min-w-0 flex-1 items-center overflow-hidden whitespace-nowrap transition-opacity duration-250 ease-linear group-data-[collapsible=icon]:opacity-0 group-data-[collapsible=icon]:pointer-events-none">
            <Link href={dashboardHref} className="grid min-w-0 flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">
                {currentSite ? currentSite.name : "Select Site"}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {currentSite ? (currentSite.custom_domain || `${currentSite.subdomain}.domain.com`) : "Choose a site"}
              </span>
            </Link>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="rounded-md p-2 transition-colors hover:bg-muted"
                >
                  <ChevronsUpDown className="h-4 w-4" />
                  <span className="sr-only">Change site</span>
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
                {sites.map((site) => (
                  <DropdownMenuItem
                    key={site.id}
                    onClick={() => {
                      setCurrentSite(site)
                      router.push(`/admin/dashboard/${site.id}`)
                    }}
                    className="gap-2 p-2"
                  >
                    <div className="flex h-6 shrink-0 items-center justify-center">
                      {site.settings?.favicon ? (
                        <img
                          src={site.settings.favicon}
                          alt={`${site.name} favicon`}
                          className="h-6 w-auto object-contain"
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
                    <a
                      href={getSiteUrl(site)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(event) => event.stopPropagation()}
                      className="flex size-6 items-center justify-center rounded-md transition-colors hover:bg-muted"
                    >
                      <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
                    </a>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/admin/sites?create=1" className="gap-2 p-2">
                    <div className="flex size-6 items-center justify-center rounded-md border bg-transparent">
                      <Plus className="size-4" />
                    </div>
                    <div className="font-medium text-muted-foreground">Add Site</div>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/admin/sites" className="gap-2 p-2">
                    <div className="flex size-6 items-center justify-center rounded-md border bg-transparent">
                      <Globe className="size-4" />
                    </div>
                    <div className="font-medium text-muted-foreground">Manage Sites</div>
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
