import { Loader2Icon, MenuIcon } from "lucide-react"

import { AddLinkButton, SortableLinks } from "@/components/menu-links"
import { Button } from "@/components/ui/button"
import type { Menu } from "@/lib/menu"
import type { SaveStatus } from "@/lib/use-menu"

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

/** The top bar: its own links, a + to add one, and whether the menu is saved. */
export function TopBar({
  menu,
  saveStatus,
  onRetrySave,
  onOpenMenu,
}: {
  menu: Menu
  saveStatus: SaveStatus
  onRetrySave: () => void
  onOpenMenu: () => void
}) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b border-sidebar-border bg-sidebar px-4 text-sidebar-foreground">
      <Button
        variant="ghost"
        size="icon-sm"
        className="md:hidden"
        aria-label="Open the menu"
        onClick={onOpenMenu}
      >
        <MenuIcon />
      </Button>
      <nav aria-label="Top links" className="flex min-w-0 flex-1 items-center gap-1">
        <SortableLinks
          links={menu.top}
          place={{ kind: "top" }}
          orientation="horizontal"
          className="min-w-0"
        />
        <AddLinkButton place={{ kind: "top" }} label="Add a link to the top bar" compact />
      </nav>
      <div className="flex shrink-0 justify-end sm:max-w-80">
        <SaveState status={saveStatus} onRetry={onRetrySave} />
      </div>
    </header>
  )
}
