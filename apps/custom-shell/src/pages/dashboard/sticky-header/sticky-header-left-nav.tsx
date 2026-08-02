"use client"

import * as React from "react"
import { ChevronDownIcon } from "lucide-react"
import { Link } from "@tanstack/react-router"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useIsMobile } from "@/hooks/use-mobile"
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
}

function isExternalHref(href?: string) {
  if (!href) {
    return false
  }

  return (
    href.startsWith("http://") ||
    href.startsWith("https://") ||
    href.startsWith("mailto:")
  )
}

/**
 * The router's `Link` takes a path, a query and a hash separately, while a
 * sidebar link is one string an admin typed — so split it here. Without this a
 * link like `/admin/media?tab=images` would be asked for as a page whose name
 * literally contains a question mark, which is not the page.
 */
function toLinkProps(href: string) {
  const [beforeHash, hash] = href.split("#")
  const [pathname, query] = beforeHash.split("?")

  return {
    to: pathname,
    search: query ? Object.fromEntries(new URLSearchParams(query)) : undefined,
    hash: hash || undefined,
  }
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

/** The same link inside the phone menu, wearing the menu row's own styling. */
function MenuNavLink({
  link,
}: {
  link: StickyHeaderLeftNavLink & { href: string }
}) {
  const className = cn(link.active && "bg-accent text-accent-foreground")

  if (link.external || isExternalHref(link.href)) {
    return (
      <a
        href={link.href}
        target="_blank"
        rel="noreferrer"
        onClick={link.onClick}
        className={className}
      >
        <NavLinkBody link={link} />
      </a>
    )
  }

  return (
    <Link
      {...toLinkProps(link.href)}
      onClick={link.onClick}
      className={className}
    >
      <NavLinkBody link={link} />
    </Link>
  )
}

export function StickyHeaderLeftNav({ navLinks }: StickyHeaderLeftNavProps) {
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
          <Button variant="ghost" className="gap-1.5">
            {activeLink.icon ? (
              <span className="flex h-3.5 w-3.5 items-center justify-center">
                {activeLink.icon}
              </span>
            ) : null}
            <span>{activeLink.label}</span>
            <ChevronDownIcon className="size-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {navLinks.map((link) =>
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
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  return (
    <div className="inline-flex h-8 items-center gap-1 rounded-md">
      {navLinks.map((link) => (
        <NavLink
          key={`${link.href}-${link.label}`}
          link={link}
          className="px-3"
        />
      ))}
    </div>
  )
}
