"use client"

import * as React from "react"
import { ChevronRight } from "lucide-react"

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
} from "@/components/ui/sidebar"
import { UNTITLED_SECTION_LABEL } from "@/lib/custom-shell"
import {
  collapseStorageKey,
  useRememberedCollapse,
} from "@/lib/remembered-choice"

type SidebarGroupChild = {
  id: string
  label: string
  href: string
  icon?: React.ReactNode
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
  id: string
  title: string
  entries: SidebarGroupEntry[]
  onNavigate?: (href: string) => void
}

function getNavLinkProps(
  href: string,
  onClick: () => void,
  onNavigate?: (href: string) => void
) {
  const isExternal =
    href.startsWith("http://") ||
    href.startsWith("https://") ||
    href.startsWith("mailto:")

  return {
    href,
    target: isExternal ? "_blank" : undefined,
    rel: isExternal ? "noreferrer" : undefined,
    onClick: (event: React.MouseEvent<HTMLAnchorElement>) => {
      if (!isExternal) {
        event.preventDefault()
        onNavigate?.(href)
      }

      onClick()
    },
  }
}

export function SidebarCollapsible({
  id,
  title,
  entries,
  onNavigate,
}: SidebarGroupProps) {
  const { state, setOpenMobile } = useSidebar()
  const [open, setOpen, noFlashKey] = useRememberedCollapse(
    collapseStorageKey.sidebarSection(id)
  )
  const handleNavClick = React.useCallback(() => {
    setOpenMobile(false)
  }, [setOpenMobile])

  if (!entries.length) {
    return null
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <SidebarGroup className="px-2 py-0">
        <SidebarGroupLabel
          asChild
          className="group/section-label cursor-pointer justify-between pr-1"
        >
          <CollapsibleTrigger>
            <span className="truncate">{title || UNTITLED_SECTION_LABEL}</span>
            <ChevronRight className="opacity-0 transition-[opacity,transform] duration-200 group-hover/section-label:opacity-100 group-focus-visible/section-label:opacity-100 group-data-[state=open]/section-label:rotate-90" />
          </CollapsibleTrigger>
        </SidebarGroupLabel>
        <CollapsibleContent className="pb-2" data-collapse-key={noFlashKey}>
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
                <div
                  data-active={entry.active}
                  className="flex w-full items-center rounded-md transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground data-active:bg-sidebar-accent data-active:text-sidebar-accent-foreground"
                >
                  <SidebarMenuButton
                    asChild
                    tooltip={entry.label}
                    isActive={entry.active}
                    className="flex-1 hover:bg-transparent active:bg-transparent data-active:bg-transparent data-open:hover:bg-transparent"
                  >
                    <a {...getNavLinkProps(entry.href, handleNavClick, onNavigate)}>
                      {entry.icon}
                      <span>{entry.label}</span>
                    </a>
                  </SidebarMenuButton>
                  {state === "expanded" && hasChildren ? (
                    <CollapsibleTrigger asChild>
                      <button
                        type="button"
                        className="rounded-md p-2 opacity-0 transition-[opacity,color] hover:bg-transparent group-hover/collapsible:opacity-100 focus-visible:opacity-100"
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
                            <a {...getNavLinkProps(child.href, handleNavClick, onNavigate)}>
                              {child.icon}
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
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  )
}
