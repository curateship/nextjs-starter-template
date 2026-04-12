import * as React from "react"
import { Link } from "@tanstack/react-router"
import { ChevronRight } from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  renderShellIcon,
  useSidebar,
} from "@repo/admin-shell"
import { config } from "@/lib/config"

function BrandLink() {
  return (
    <div className="relative flex min-h-8 items-center py-2">
      <Link
        to="/"
        className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-sidebar-primary text-sidebar-primary-foreground"
      >
        <span className="text-xs font-semibold">S</span>
      </Link>
      <div className="absolute inset-y-0 left-10 right-0 flex min-w-0 items-center overflow-hidden whitespace-nowrap transition-opacity duration-250 ease-linear group-data-[collapsible=icon]:opacity-0 group-data-[collapsible=icon]:pointer-events-none">
        <Link to="/" className="grid min-w-0 flex-1 text-left text-sm leading-tight">
          <span className="truncate font-medium">{config.appName}</span>
          <span className="truncate text-xs text-muted-foreground">Google Maps</span>
        </Link>
      </div>
    </div>
  )
}

function SidebarLink({
  to,
  label,
  icon,
}: {
  to: "/" | "/runs" | "/runs/new" | "/schedules"
  label: string
  icon?: React.ReactNode
}) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild tooltip={label}>
        <Link to={to}>
          {icon}
          <span>{label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

function RunsMenu({ pathname }: { pathname: string }) {
  const { state } = useSidebar()
  const isNewRunRoute = pathname === "/runs/new"
  const [isOpen, setIsOpen] = React.useState(false)

  return (
    <SidebarMenuItem
      className="group/collapsible"
      data-state={isOpen ? "open" : "closed"}
    >
      <div className="flex w-full items-center">
        <SidebarMenuButton
          asChild
          tooltip="Runs"
          className="flex-1"
        >
          <Link to="/runs">
            {renderShellIcon("workflow")}
            <span>Runs</span>
          </Link>
        </SidebarMenuButton>
        {state === "expanded" ? (
          <button
            type="button"
            className="rounded-md p-2 transition-colors hover:bg-muted"
            aria-label={isOpen ? "Collapse Runs menu" : "Expand Runs menu"}
            aria-expanded={isOpen}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              setIsOpen((open) => !open)
            }}
          >
            <ChevronRight className="h-4 w-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
            <span className="sr-only">Toggle Runs</span>
          </button>
        ) : null}
      </div>
      {isOpen ? (
        <SidebarMenuSub>
          <SidebarMenuSubItem>
            <SidebarMenuSubButton asChild>
              <Link to="/runs/new">
                <span>New run</span>
              </Link>
            </SidebarMenuSubButton>
          </SidebarMenuSubItem>
        </SidebarMenuSub>
      ) : null}
    </SidebarMenuItem>
  )
}

export function ScraperSidebar({ pathname }: { pathname: string }) {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <BrandLink />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Google Maps</SidebarGroupLabel>
          <SidebarMenu>
            <SidebarLink
              to="/"
              label="Overview"
              icon={renderShellIcon("layoutDashboard")}
            />
            <RunsMenu pathname={pathname} />
            <SidebarLink
              to="/schedules"
              label="Schedules"
              icon={renderShellIcon("calendar")}
            />
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}
