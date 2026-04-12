"use client"

import * as React from "react"
import { ChevronRight } from "lucide-react"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./ui/collapsible"
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
} from "./ui/sidebar"

type SidebarGroupChild = {
  id: string
  label: string
  href: string
  active?: boolean
}

export type SidebarGroupEntry =
  | {
      type: "divider"
      id: string
      label: string
    }
  | {
      type: "item"
      id: string
      label: string
      href: string
      icon?: React.ReactNode
      active?: boolean
      children?: SidebarGroupChild[]
    }

type SidebarGroupProps = {
  title: string
  entries: SidebarGroupEntry[]
}

function getNavLinkProps(href: string, onClick: () => void) {
  const isExternal =
    href.startsWith("http://") ||
    href.startsWith("https://") ||
    href.startsWith("mailto:")
  const usesRealNavigation = isExternal || href.startsWith("#")

  return {
    href: usesRealNavigation ? href : "#",
    target: isExternal ? "_blank" : undefined,
    rel: isExternal ? "noreferrer" : undefined,
    onClick: (event: React.MouseEvent<HTMLAnchorElement>) => {
      if (!usesRealNavigation) {
        event.preventDefault()
      }

      onClick()
    },
  }
}

export function SidebarCollapsible({ title, entries }: SidebarGroupProps) {
  const { state, setOpenMobile } = useSidebar()

  if (!entries.length) {
    return null
  }

  const handleNavClick = React.useCallback(() => {
    setOpenMobile(false)
  }, [setOpenMobile])

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{title || "Untitled Section"}</SidebarGroupLabel>
      <SidebarMenu>
        {entries.map((entry) => {
          if (entry.type === "divider") {
            return (
              <li
                key={entry.id}
                className="px-2 py-2 group-data-[collapsible=icon]:hidden"
              >
                <div className="flex items-center gap-2 text-sidebar-foreground/45">
                  <div className="h-px flex-1 bg-sidebar-border" />
                  <span className="text-[10px] font-semibold uppercase tracking-[0.18em]">
                    {entry.label || "Divider"}
                  </span>
                  <div className="h-px flex-1 bg-sidebar-border" />
                </div>
              </li>
            )
          }

          const hasChildren = Boolean(entry.children?.length)
          const hasActiveChild = Boolean(
            entry.children?.some((child) => child.active)
          )

          return (
            <Collapsible
              key={entry.id}
              asChild
              defaultOpen={entry.active || hasActiveChild}
              className="group/collapsible"
            >
              <SidebarMenuItem>
                <div className="flex w-full items-center">
                  <SidebarMenuButton
                    asChild
                    tooltip={entry.label}
                    isActive={entry.active || hasActiveChild}
                    className="flex-1"
                  >
                    <a {...getNavLinkProps(entry.href, handleNavClick)}>
                      {entry.icon}
                      <span>{entry.label}</span>
                    </a>
                  </SidebarMenuButton>
                  {state === "expanded" && hasChildren ? (
                    <CollapsibleTrigger asChild>
                      <button
                        type="button"
                        className="rounded-md p-2 transition-colors hover:bg-muted"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <ChevronRight className="h-4 w-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                        <span className="sr-only">Toggle {entry.label}</span>
                      </button>
                    </CollapsibleTrigger>
                  ) : null}
                </div>
                {hasChildren ? (
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {entry.children?.map((child) => (
                        <SidebarMenuSubItem key={child.id}>
                          <SidebarMenuSubButton asChild isActive={child.active}>
                            <a {...getNavLinkProps(child.href, handleNavClick)}>
                              <span>{child.label}</span>
                            </a>
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
