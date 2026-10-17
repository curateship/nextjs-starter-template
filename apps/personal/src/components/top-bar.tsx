import { ChevronDownIcon, Loader2Icon, MenuIcon, SettingsIcon } from "lucide-react"

import { LinkIconPicture } from "@/components/link-icon"
import { AddLinkButton, SortableLinks, useMenuActions } from "@/components/menu-links"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { personalPath, type Menu, type MenuLink } from "@/lib/menu"
import type { SaveStatus } from "@/lib/use-menu"
import { cn } from "@/lib/utils"

/** Opens a link's screen on a plain click; a modified click is left to the browser. */
function openOnClick(open: (url: string) => void, url: string) {
  return (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
    event.preventDefault()
    open(url)
  }
}

/**
 * The open left-menu link and its sub-links, at the top bar's left end, the
 * way Custom Shell's top left mirrors its menu. A row of links from 768px; on
 * a phone, one button naming the open one, with the rest in its dropdown.
 */
function SubLinks({ links }: { links: MenuLink[] }) {
  const { activeId, open } = useMenuActions()
  const current = links.find((link) => link.id === activeId) ?? links[0]

  return (
    <>
      <ul aria-label="Sub-links" className="hidden min-w-0 shrink items-center gap-1 md:flex">
        {links.map((link) => {
          const active = link.id === activeId
          return (
            <li key={link.id} className="min-w-0">
              <a
                href={personalPath(link.url)}
                aria-current={active ? "page" : undefined}
                onClick={openOnClick(open, link.url)}
                className={cn(
                  "inline-flex h-8 max-w-full items-center gap-1.5 rounded-md px-3 text-sm font-medium whitespace-nowrap outline-hidden transition-all focus-visible:ring-2 focus-visible:ring-sidebar-ring [&_svg]:size-3.5 [&_svg]:shrink-0",
                  active ? "bg-muted text-foreground" : "hover:bg-muted"
                )}
              >
                <LinkIconPicture name={link.icon} />
                <span className="truncate">{link.label}</span>
              </a>
            </li>
          )
        })}
      </ul>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="min-w-0 shrink gap-1.5 md:hidden">
            <LinkIconPicture name={current.icon} />
            <span className="min-w-0 truncate">{current.label}</span>
            <ChevronDownIcon className="size-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-auto min-w-40">
          {links.map((link) => (
            <DropdownMenuItem
              key={link.id}
              asChild
              className={cn(link.id === activeId && "bg-accent text-accent-foreground")}
            >
              <a
                href={personalPath(link.url)}
                aria-current={link.id === activeId ? "page" : undefined}
                onClick={openOnClick(open, link.url)}
              >
                <LinkIconPicture name={link.icon} />
                {link.label}
              </a>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}

function SaveState({ status, onRetry }: { status: SaveStatus; onRetry: () => void }) {
  if (status === "idle") return null
  if (status === "saving") {
    return (
      <span role="status" className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2Icon className="size-3.5 animate-spin" />
        Saving
      </span>
    )
  }
  if (status === "saved") {
    return (
      <span role="status" className="text-xs text-muted-foreground">
        Saved
      </span>
    )
  }
  return (
    <span role="alert" className="flex min-w-0 items-center gap-2 text-xs text-destructive">
      <span className="truncate">Not saved: {status.failed}</span>
      <Button variant="outline" size="xs" onClick={onRetry}>
        Retry
      </Button>
    </span>
  )
}

/**
 * The top bar: the open link's sub-links at the left when it has any, and at
 * the right the bar's own links with a + to add one while editing, whether the
 * menu is saved, and the cog at the far right. The cog is a dropdown so Personal's
 * other admin controls can join "Edit the menu" there later.
 */
export function TopBar({
  menu,
  subLinks,
  saveStatus,
  onRetrySave,
  onOpenMenu,
  editing,
  onEditingChange,
}: {
  menu: Menu
  /** The open link and its sub-links, or null. */
  subLinks: MenuLink[] | null
  saveStatus: SaveStatus
  onRetrySave: () => void
  onOpenMenu: () => void
  editing: boolean
  onEditingChange: (editing: boolean) => void
}) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b border-sidebar-border/50 bg-sidebar px-4 text-sidebar-foreground">
      <Button
        variant="ghost"
        size="icon-sm"
        className="md:hidden"
        aria-label="Open the menu"
        onClick={onOpenMenu}
      >
        <MenuIcon />
      </Button>
      {/* The open link's sub-links at the left end, which also takes up the
          spare room, so the bar's own links sit at the right, next to the
          cog. Tyler asked for them on the right on 16 Oct 2026. It starts
          from its own width (flex-auto, not flex-1), so on a narrow bar both
          halves give up room together and the open screen's name isn't the
          first thing cut. */}
      <div className="flex min-w-0 flex-auto items-center">
        {subLinks ? <SubLinks links={subLinks} /> : null}
      </div>
      <nav aria-label="Top links" className="flex min-w-0 shrink items-center justify-end gap-1">
        <SortableLinks
          links={menu.top}
          place={{ kind: "top" }}
          orientation="horizontal"
          className="min-w-0"
        />
        <AddLinkButton place={{ kind: "top" }} label="Add a link to the top bar" look="icon" />
      </nav>
      <div className="flex shrink-0 items-center justify-end gap-2 sm:max-w-80">
        <SaveState status={saveStatus} onRetry={onRetrySave} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Settings">
              <SettingsIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuCheckboxItem checked={editing} onCheckedChange={onEditingChange}>
              Edit the menu
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
