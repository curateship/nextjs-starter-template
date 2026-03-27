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
} from "@/components/ui/sidebar"
import { ChevronRightIcon } from "lucide-react"
import { isShellItem, renderShellIcon, type ShellSection } from "@/lib/custom-shell"

export function SidebarSection({ section }: { section: ShellSection }) {
  const visibleEntries = section.entries.filter((entry) => {
    return !isShellItem(entry) || entry.visible
  })

  if (!visibleEntries.length) {
    return null
  }

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{section.title || "Untitled Section"}</SidebarGroupLabel>
      <SidebarMenu>
        {visibleEntries.map((entry) =>
          isShellItem(entry) ? (
            entry.children?.length ? (
              <Collapsible
                key={entry.id}
                asChild
                defaultOpen
                className="group/collapsible"
              >
                <SidebarMenuItem>
                  <div className="flex items-center gap-1">
                    <SidebarMenuButton
                      type="button"
                      tooltip={entry.label}
                      className="min-w-0 flex-1"
                    >
                      {renderShellIcon(entry.icon)}
                      <span>{entry.label}</span>
                    </SidebarMenuButton>
                    <CollapsibleTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <ChevronRightIcon className="size-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                        <span className="sr-only">Toggle {entry.label}</span>
                      </button>
                    </CollapsibleTrigger>
                  </div>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {entry.children.map((child) => (
                        <SidebarMenuSubItem key={child.id}>
                          <SidebarMenuSubButton asChild>
                            <a href={child.href}>
                              <span>{child.label}</span>
                            </a>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>
            ) : (
              <SidebarMenuItem key={entry.id}>
                <SidebarMenuButton asChild tooltip={entry.label}>
                  <button type="button" title={`${entry.label} (${entry.href})`}>
                    {renderShellIcon(entry.icon)}
                    <span>{entry.label}</span>
                  </button>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          ) : (
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
        )}
      </SidebarMenu>
    </SidebarGroup>
  )
}
