"use client"

import * as React from "react"
import { Link } from "@tanstack/react-router"

import { useOpenAccount } from "@/components/account/account-dialog"
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
} from "@/components/ui/sidebar"
import { useStopViewingAs } from "@/lib/hooks/use-stop-viewing-as"
import {
  BadgeCheckIcon,
  BellIcon,
  ChevronsUpDownIcon,
  CreditCardIcon,
  EyeOffIcon,
  Loader2Icon,
  LogOutIcon,
  SettingsIcon,
  ShieldCheckIcon,
  SparklesIcon,
} from "lucide-react"

/**
 * The account's photo, or its initials when there is none.
 *
 * The image is left out entirely rather than given an empty `src`, which React
 * warns about because the browser treats it as a request for the page itself.
 * A photo whose file has gone missing falls back to the initials too — that is
 * `AvatarImage`'s own behavior when the picture will not load.
 */
function UserAvatar({
  user,
  initials,
}: {
  user: { name: string; avatar: string }
  initials: string
}) {
  return (
    <Avatar className="h-8 w-8 rounded-lg">
      {user.avatar ? <AvatarImage src={user.avatar} alt={user.name} /> : null}
      <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
    </Avatar>
  )
}

export function UserDropdown({
  user,
  onLogout,
  viewingAsMember,
  isAdmin,
  showUpgrade,
}: {
  user: {
    name: string
    email: string
    avatar: string
  }
  onLogout: () => void
  /** True while an admin is looking at the app as the person shown here. */
  viewingAsMember: boolean
  isAdmin: boolean
  showUpgrade: boolean
}) {
  const { isMobile, setOpenMobile } = useSidebar()
  const openAccount = useOpenAccount()
  const { leaving, stopViewing } = useStopViewingAs()
  const initials = React.useMemo(() => {
    const source = user.name || user.email || "User"

    return source
      .split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase()
  }, [user.email, user.name])
  const closeMobileSidebar = () => {
    if (isMobile) setOpenMobile(false)
  }
  const openAccountFromSidebar = (
    tab: "profile" | "billing" | "security"
  ) => {
    closeMobileSidebar()
    openAccount(tab)
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
              <UserAvatar user={user} initials={initials} />
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{user.name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {user.email}
                </span>
              </div>
              <ChevronsUpDownIcon className="ml-auto size-4" />
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
                <UserAvatar user={user} initials={initials} />
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{user.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {user.email}
                  </span>
                </div>
              </div>
            </DropdownMenuLabel>
            {showUpgrade ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem asChild>
                    <Link to="/pricing" onClick={closeMobileSidebar}>
                      <SparklesIcon />
                      Upgrade
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                onSelect={() => openAccountFromSidebar("profile")}
              >
                <BadgeCheckIcon />
                Account
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => openAccountFromSidebar("billing")}
              >
                <CreditCardIcon />
                Billing
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => openAccountFromSidebar("security")}
              >
                <ShieldCheckIcon />
                Security
              </DropdownMenuItem>
              {isAdmin ? (
                <>
                  <DropdownMenuItem asChild>
                    <Link
                      to="/admin/notifications"
                      onClick={closeMobileSidebar}
                    >
                      <BellIcon />
                      Notifications
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/admin/settings" onClick={closeMobileSidebar}>
                      <SettingsIcon />
                      Settings
                    </Link>
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            {/* This menu is showing the member's name, email and photo while
                the admin is the one clicking it, so "Log out" here would end
                the admin's own session — their real one — on a menu that reads
                as somebody else's. The last item becomes the way out of the
                view instead, which is also the only exit that was previously
                reachable from the reminder alone. Ordinary sign-out is
                untouched for everybody else. */}
            {viewingAsMember ? (
              <DropdownMenuItem
                disabled={leaving}
                onSelect={(event) => {
                  // Keep the menu open while the request runs; the page is
                  // about to reload anyway.
                  event.preventDefault()
                  void stopViewing()
                }}
              >
                {leaving ? (
                  <Loader2Icon className="animate-spin" />
                ) : (
                  <EyeOffIcon />
                )}
                Stop viewing
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                onClick={() => {
                  closeMobileSidebar()
                  onLogout()
                }}
              >
                <LogOutIcon />
                Log out
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
