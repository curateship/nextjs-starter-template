"use client"

import * as React from "react"
import { Link } from "@tanstack/react-router"
import { ChevronsUpDownIcon, PlusIcon } from "lucide-react"

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
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"

type WorkspaceTeam = {
  id: string
  name: string
  logo: React.ReactNode
  plan: string
  href?: string
}

export function WorkspaceSwitcher({
  teams,
}: {
  teams: WorkspaceTeam[]
}) {
  const { isMobile } = useSidebar()
  const [activeTeamId, setActiveTeamId] = React.useState(teams[0]?.id)
  const activeTeam = teams.find((team) => team.id === activeTeamId) ?? teams[0]

  React.useEffect(() => {
    if (!teams.some((team) => team.id === activeTeamId)) {
      setActiveTeamId(teams[0]?.id)
    }
  }, [activeTeamId, teams])

  if (!activeTeam) {
    return null
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <div className="relative flex min-h-8 items-center py-2">
          <Link
            to={activeTeam.href || "/"}
            className="flex size-8 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg bg-sidebar-primary text-sidebar-primary-foreground"
          >
            {activeTeam.logo}
          </Link>
          <div className="absolute left-10 right-0 flex min-w-0 items-center overflow-visible whitespace-nowrap transition-opacity duration-250 ease-linear group-data-[collapsible=icon]:pointer-events-none group-data-[collapsible=icon]:opacity-0">
            <Link
              to={activeTeam.href || "/"}
              className="grid min-w-0 flex-1 text-left text-sm leading-tight"
            >
              <span className="truncate font-medium">{activeTeam.name}</span>
              <span className="truncate text-xs text-muted-foreground">
                {activeTeam.plan}
              </span>
            </Link>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="rounded-md p-2 transition-colors hover:bg-muted"
                >
                  <ChevronsUpDownIcon className="h-4 w-4" />
                  <span className="sr-only">Change workspace</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-72 rounded-lg"
                align="start"
                side={isMobile ? "bottom" : "right"}
                sideOffset={4}
              >
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  Workspaces
                </DropdownMenuLabel>
                {teams.map((team) => (
                  <DropdownMenuItem
                    key={team.id}
                    onClick={() => setActiveTeamId(team.id)}
                    className="gap-2 p-2"
                  >
                    <div className="flex size-6 items-center justify-center rounded-md border border-border">
                      {team.logo}
                    </div>
                    <div className="flex-1">
                      <div className="font-medium">{team.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {team.plan}
                      </div>
                    </div>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem className="gap-2 p-2">
                  <div className="flex size-6 items-center justify-center rounded-md border border-border bg-transparent">
                    <PlusIcon className="size-4" />
                  </div>
                  <div className="font-medium text-muted-foreground">
                    Add workspace
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
