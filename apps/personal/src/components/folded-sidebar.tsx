import * as React from "react"
import { PanelLeftOpenIcon } from "lucide-react"

import { BrandLogo } from "@/components/brand-editor"
import { LinkIconPicture } from "@/components/link-icon"
import { linkAnchorProps, useMenuActions } from "@/components/menu-links"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { isBlankSpace } from "@/lib/blank-space"
import { opensInTab, pinnedLinks, type Menu, type MenuLink } from "@/lib/menu"

/**
 * One link as its icon alone, its name in a tooltip. A link with no icon
 * shows its first letter. It is marked while it or one of its sub-links is
 * open, as the full menu marks it.
 */
function FoldedLink({ link }: { link: MenuLink }) {
  const { activeId, open } = useMenuActions()
  const active =
    activeId === link.id || (link.children ?? []).some((child) => child.id === activeId)
  const name = opensInTab(link) ? `${link.label} (opens in its own tab)` : link.label

  return (
    <li>
      <Tooltip>
        <TooltipTrigger asChild>
          <a
            {...linkAnchorProps(link, open)}
            aria-label={name}
            aria-current={activeId === link.id ? "page" : undefined}
            data-active={active ? "" : undefined}
            className="flex size-8 items-center justify-center rounded-md text-sidebar-foreground outline-hidden hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring data-active:bg-sidebar-accent data-active:text-sidebar-accent-foreground"
          >
            {link.icon ? (
              <LinkIconPicture name={link.icon} />
            ) : (
              <span aria-hidden className="text-xs font-medium uppercase">
                {link.label.trim().charAt(0) || "?"}
              </span>
            )}
          </a>
        </TooltipTrigger>
        <TooltipContent side="right">{name}</TooltipContent>
      </Tooltip>
    </li>
  )
}

function FoldedLinks({ links }: { links: MenuLink[] }) {
  if (links.length === 0) return null
  return (
    <ul className="flex flex-col gap-0.5">
      {links.map((link) => (
        <FoldedLink key={link.id} link={link} />
      ))}
    </ul>
  )
}

/**
 * The left menu folded down to icons, as Custom Shell folds its own. Tyler
 * asked for it on 22 Oct 2026: "collapse the sidebar to only show the icons
 * like how normal app does it". Pinned, then each section's links, then the
 * links at the bottom, each as its icon; section names and sub-links hide
 * until it unfolds. The logo turns into the unfold button on hover.
 */
export function FoldedSidebar({
  menu,
  onUnfold,
  footer,
}: {
  menu: Menu
  onUnfold: () => void
  footer: React.ReactNode
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 shrink-0 items-center justify-center p-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="Unfold the menu"
              onClick={onUnfold}
              className="group/unfold flex size-8 items-center justify-center rounded-md outline-hidden hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring"
            >
              <span className="flex group-hover/unfold:hidden group-focus-visible/unfold:hidden">
                <BrandLogo logo={menu.brand?.logo} />
              </span>
              <PanelLeftOpenIcon className="hidden size-4 group-hover/unfold:block group-focus-visible/unfold:block" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Unfold the menu</TooltipContent>
        </Tooltip>
      </div>
      <ScrollArea
        className="min-h-0 flex-1"
        onDoubleClick={(event) => {
          if (isBlankSpace(event.target)) onUnfold()
        }}
      >
        <nav aria-label="Screens" className="flex flex-col items-center gap-2 p-2">
          <FoldedLinks links={pinnedLinks(menu)} />
          {menu.sections.map((section) => (
            <FoldedLinks key={section.id} links={section.links} />
          ))}
        </nav>
      </ScrollArea>
      {menu.top.length ? (
        <nav
          aria-label="Bottom links"
          className="flex shrink-0 justify-center border-t border-sidebar-border/50 p-2"
        >
          <FoldedLinks links={menu.top} />
        </nav>
      ) : null}
      {footer}
    </div>
  )
}
