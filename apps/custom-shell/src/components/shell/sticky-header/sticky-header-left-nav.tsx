"use client"

import * as React from "react"
import { ChevronDownIcon, EllipsisVerticalIcon } from "lucide-react"
import { Link } from "@tanstack/react-router"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useIsMobile } from "@/hooks/use-mobile"
import { isExternalHref, toLinkProps } from "@/lib/nav/nav-href"
import { cn } from "@/lib/utils"

export type StickyHeaderLeftNavLink = {
  label: string
  active?: boolean
  href?: string
  icon?: React.ReactNode
  external?: boolean
  onClick?: React.MouseEventHandler<HTMLElement>
}

type StickyHeaderLeftNavProps = {
  navLinks: StickyHeaderLeftNavLink[]
  /**
   * Most links to draw in the row before the rest fold into a "more" menu.
   * Zero — the default — draws every one of them, as the bar always did.
   */
  limit?: number
}

const navLinkClassName =
  "inline-flex h-8 items-center gap-1.5 rounded-md text-sm font-medium transition-all"

function NavLinkBody({ link }: { link: StickyHeaderLeftNavLink }) {
  return (
    <>
      {link.icon ? (
        <span className="flex h-3.5 w-3.5 items-center justify-center">
          {link.icon}
        </span>
      ) : null}
      {link.label}
    </>
  )
}

/**
 * One top-bar link.
 *
 * An in-app destination uses the router's own `Link`, which builds a real
 * `href` and navigates itself — so the page is fetched ahead of the click, and
 * middle-click and open-in-new-tab work like they do anywhere else on the web.
 * They did not before, when every link was a bare `<a>` whose click was
 * cancelled in favour of a manual navigate.
 *
 * Whether a link is the page you are on is decided once, by the shell
 * (`isActiveShellHref`), and handed down as `active`. The router could work
 * that out itself through `activeProps`, but then the top bar and the sidebar
 * would answer the same question two different ways, so it stays where it is.
 */
function NavLink({
  link,
  className,
}: {
  link: StickyHeaderLeftNavLink
  className?: string
}) {
  const classes = cn(
    navLinkClassName,
    link.active ? "bg-muted text-foreground" : "hover:bg-muted",
    className
  )

  if (!link.href) {
    return (
      <button
        type="button"
        onClick={
          link.onClick as React.MouseEventHandler<HTMLButtonElement> | undefined
        }
        className={classes}
      >
        <NavLinkBody link={link} />
      </button>
    )
  }

  if (link.external || isExternalHref(link.href)) {
    return (
      <a
        href={link.href}
        target="_blank"
        rel="noreferrer"
        onClick={link.onClick}
        className={classes}
      >
        <NavLinkBody link={link} />
      </a>
    )
  }

  return (
    <Link {...toLinkProps(link.href)} onClick={link.onClick} className={classes}>
      <NavLinkBody link={link} />
    </Link>
  )
}

/**
 * The same link as a menu row.
 *
 * It has to hand `...rest` down to the anchor it renders. This sits under a
 * `DropdownMenuItem asChild`, which passes the row's styling, its `menuitem`
 * role and the handler that closes the menu in as props — and a component that
 * quietly drops them renders a bare, unstyled `<a>` that screen readers do not
 * read as a menu row. It used to do exactly that.
 */
function MenuNavLink({
  link,
  className,
  onClick,
  ...rest
}: {
  link: StickyHeaderLeftNavLink & { href: string }
} & Omit<React.ComponentProps<"a">, "href">) {
  const classes = cn(className, link.active && "bg-accent text-accent-foreground")

  // Both handlers matter: the menu's own (close on pick) and the link's.
  const handleClick: React.MouseEventHandler<HTMLAnchorElement> = (event) => {
    onClick?.(event)
    link.onClick?.(event)
  }

  if (link.external || isExternalHref(link.href)) {
    return (
      <a
        {...rest}
        href={link.href}
        target="_blank"
        rel="noreferrer"
        onClick={handleClick}
        className={classes}
      >
        <NavLinkBody link={link} />
      </a>
    )
  }

  return (
    <Link
      {...rest}
      {...toLinkProps(link.href)}
      onClick={handleClick}
      className={classes}
    >
      <NavLinkBody link={link} />
    </Link>
  )
}

/**
 * The links as menu rows. Shared by the phone menu, which folds the whole row
 * away, and by the overflow menu that holds whatever ran past the limit.
 */
function NavMenuItems({ links }: { links: StickyHeaderLeftNavLink[] }) {
  return (
    <>
      {links.map((link) =>
        link.href ? (
          <DropdownMenuItem key={`${link.href}-${link.label}`} asChild>
            <MenuNavLink link={{ ...link, href: link.href }} />
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            key={`${link.href}-${link.label}`}
            className={cn(link.active && "bg-accent text-accent-foreground")}
            onClick={
              link.onClick as
                | React.MouseEventHandler<HTMLDivElement>
                | undefined
            }
          >
            <NavLinkBody link={link} />
          </DropdownMenuItem>
        )
      )}
    </>
  )
}

export function StickyHeaderLeftNav({
  navLinks,
  limit = 0,
}: StickyHeaderLeftNavProps) {
  const isMobile = useIsMobile()

  if (!navLinks.length) {
    return null
  }

  if (isMobile) {
    if (navLinks.length === 1) {
      return <NavLink link={navLinks[0]} className="px-2.5" />
    }

    const activeLink = navLinks.find((link) => link.active) ?? navLinks[0]

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="max-w-28 min-w-0 shrink gap-1.5">
            {activeLink.icon ? (
              <span className="flex h-3.5 w-3.5 items-center justify-center">
                {activeLink.icon}
              </span>
            ) : null}
            <span className="max-w-20 min-w-0 truncate">
              {activeLink.label}
            </span>
            <ChevronDownIcon className="size-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <NavMenuItems links={navLinks} />
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  // Anything past the limit folds away, one link included: the row shows the
  // number that was asked for, rather than quietly allowing an extra.
  const overflowing = limit > 0 && navLinks.length > limit
  const shownLinks = overflowing ? navLinks.slice(0, limit) : navLinks
  const overflowLinks = overflowing ? navLinks.slice(limit) : []

  return (
    <div className="inline-flex h-8 items-center gap-1 rounded-md">
      {shownLinks.map((link) => (
        <NavLink
          key={`${link.href}-${link.label}`}
          link={link}
          className="px-3"
        />
      ))}

      {/* Whatever ran past the limit. The page you are on can end up in here,
          in which case nothing in the row is highlighted — the row shows the
          first few links, full stop, rather than shuffling to keep the current
          page visible. */}
      {overflowLinks.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={
                overflowLinks.length === 1
                  ? "1 more link"
                  : `${overflowLinks.length} more links`
              }
            >
              <EllipsisVerticalIcon className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          {/* Sized to its own labels. A menu matches its button's width by
              default, and this button is a 32px square, so the names inside
              were being cut off mid-word. */}
          <DropdownMenuContent align="start" className="w-auto min-w-40">
            <NavMenuItems links={overflowLinks} />
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  )
}
