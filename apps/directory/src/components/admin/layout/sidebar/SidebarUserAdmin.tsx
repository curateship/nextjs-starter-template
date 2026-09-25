"use client"

import BadgeCheck from "lucide-react/dist/esm/icons/badge-check.js"
import Bell from "lucide-react/dist/esm/icons/bell.js"
import ChevronsUpDown from "lucide-react/dist/esm/icons/chevrons-up-down.js"
import CreditCard from "lucide-react/dist/esm/icons/credit-card.js"
import LogOut from "lucide-react/dist/esm/icons/log-out.js"
import Settings from "lucide-react/dist/esm/icons/settings.js"
import Sparkles from "lucide-react/dist/esm/icons/sparkles.js"
import Link from "@/components/app-link"
import { authClient } from "@/lib/actions/auth/client"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { getSiteUrl } from "@/lib/utils/site-url-generator"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
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

export function SidebarUserAdmin({
  user,
}: {
  user: {
    name: string
    email: string
    avatar: string
  }
}) {
  const { isMobile } = useSidebar()
  const { currentSite, sites } = useSiteSwitcher()

  const getLogoutRedirect = () => {
    if (currentSite) {
      return getSiteUrl(currentSite)
    }

    const savedSiteId = window.localStorage.getItem("selectedSiteId")
    if (savedSiteId) {
      const savedSite = sites.find((site) => site.id === savedSiteId)
      if (savedSite) {
        return getSiteUrl(savedSite)
      }
    }

    if (sites[0]) {
      return getSiteUrl(sites[0])
    }

    return "/"
  }

  const handleLogout = async () => {
    const redirectTo = getLogoutRedirect()
    await authClient.signOut()
    // Full reload (not SPA nav): sign-out clears the session cookie, so the
    // whole client must be rebuilt as a signed-out visitor. Keep intentional.
    window.location.replace(redirectTo)
  }

  const getInitials = (email: string) => {
    if (!email) return "U"
    return email.substring(0, 2).toUpperCase()
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-8 w-8 rounded-lg">
                <AvatarImage src={user.avatar} alt={user.name} />
                <AvatarFallback className="rounded-lg">{getInitials(user.email)}</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium" title={user.name}>{user.name}</span>
                <span className="truncate text-xs text-muted-foreground" title={user.email}>{user.email}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarImage src={user.avatar} alt={user.name} />
                  <AvatarFallback className="rounded-lg">{getInitials(user.email)}</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium" title={user.name}>{user.name}</span>
                  <span className="truncate text-xs" title={user.email}>{user.email}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem>
                <Sparkles />
                Upgrade to Pro
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <Link href="/admin/users/settings">
                  <Settings />
                  Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem>
                <BadgeCheck />
                Account
              </DropdownMenuItem>
              <DropdownMenuItem>
                <CreditCard />
                Billing
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Bell />
                Notifications
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuItem onClick={handleLogout}>
              <LogOut />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
