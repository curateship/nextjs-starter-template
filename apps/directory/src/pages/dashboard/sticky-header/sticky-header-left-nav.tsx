"use client"

import * as React from "react"
import { ChevronDownIcon } from "lucide-react"
import { useNavigate } from "@tanstack/react-router"

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

export function StickyHeaderLeftNav({
  navLinks,
}: StickyHeaderLeftNavProps) {
  const isMobile = useIsMobile()
  const navigate = useNavigate()

  if (!navLinks.length) {
    return null
  }

  if (isMobile) {
    if (navLinks.length === 1) {
      const link = navLinks[0]

      if (link.href) {
        return (
          <a
            href={link.href}
            target={
              link.external || isExternalHref(link.href) ? "_blank" : undefined
            }
            rel={
              link.external || isExternalHref(link.href)
                ? "noreferrer"
                : undefined
            }
            onClick={(event) => {
              link.onClick?.(event)
              if (!isExternalHref(link.href)) {
                event.preventDefault()
                navigate({ href: link.href })
              }
            }}
            className={cn(
              "inline-flex h-[30px] items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium transition-all",
              link.active
                ? "bg-muted text-foreground"
                : "hover:bg-muted"
            )}
          >
            {link.icon ? (
              <span className="flex h-3.5 w-3.5 items-center justify-center">
                {link.icon}
              </span>
            ) : null}
            {link.label}
          </a>
        )
      }

      return (
        <button
          type="button"
          onClick={link.onClick as React.MouseEventHandler<HTMLButtonElement> | undefined}
          className={cn(
            "inline-flex h-[30px] items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium transition-all",
            link.active
              ? "bg-muted text-foreground"
              : "hover:bg-muted"
          )}
        >
          {link.icon ? (
            <span className="flex h-3.5 w-3.5 items-center justify-center">
              {link.icon}
            </span>
          ) : null}
          {link.label}
        </button>
      )
    }

    const activeLink = navLinks.find((link) => link.active) ?? navLinks[0]

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-[30px] gap-1.5">
            {activeLink.icon ? (
              <span className="flex h-3.5 w-3.5 items-center justify-center">
                {activeLink.icon}
              </span>
            ) : null}
            <span className="text-[13px]">{activeLink.label}</span>
            <ChevronDownIcon className="size-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {navLinks.map((link) =>
            link.href ? (
              <DropdownMenuItem key={`${link.href}-${link.label}`} asChild>
                <a
                  href={link.href}
                  className={cn(
                    link.active && "bg-accent text-accent-foreground"
                  )}
                  target={
                    link.external || isExternalHref(link.href)
                      ? "_blank"
                      : undefined
                  }
                  rel={
                    link.external || isExternalHref(link.href)
                      ? "noreferrer"
                      : undefined
                  }
                  onClick={(event) => {
                    link.onClick?.(event)
                    if (!isExternalHref(link.href)) {
                      event.preventDefault()
                      navigate({ href: link.href })
                    }
                  }}
                >
                  {link.icon ? <span className="mr-2">{link.icon}</span> : null}
                  {link.label}
                </a>
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                key={`${link.href}-${link.label}`}
                className={cn(
                  link.active && "bg-accent text-accent-foreground"
                )}
                onClick={
                  link.onClick as
                    | React.MouseEventHandler<HTMLDivElement>
                    | undefined
                }
              >
                {link.icon ? <span className="mr-2">{link.icon}</span> : null}
                {link.label}
              </DropdownMenuItem>
            )
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  return (
    <div className="inline-flex h-8 items-center rounded-md gap-1">
      {navLinks.map((link) =>
        link.href ? (
          <a
            key={`${link.href}-${link.label}`}
            href={link.href}
            target={link.external || isExternalHref(link.href) ? "_blank" : undefined}
            rel={link.external || isExternalHref(link.href) ? "noreferrer" : undefined}
            aria-label={isMobile ? link.label : undefined}
            onClick={(event) => {
              link.onClick?.(event)
              if (!isExternalHref(link.href)) {
                event.preventDefault()
                navigate({ href: link.href })
              }
            }}
            title={isMobile ? link.label : undefined}
            className={cn(
              "inline-flex h-full items-center justify-center px-2.5 text-sm font-medium transition-all",
              !isMobile && "px-3",
              isMobile && "bg-muted",
              link.active
                ? "bg-muted text-foreground rounded-md"
                : "hover:bg-muted rounded-md"
            )}
          >
            {link.icon ? (
              <span
                className={cn(
                  "flex h-3.5 w-3.5 items-center justify-center",
                  !isMobile && "mr-1.5"
                )}
              >
                {link.icon}
              </span>
            ) : null}
            {(!isMobile || !link.icon) ? <span>{link.label}</span> : null}
          </a>
        ) : (
          <button
            key={`${link.href}-${link.label}`}
            type="button"
            aria-label={isMobile ? link.label : undefined}
            onClick={link.onClick as React.MouseEventHandler<HTMLButtonElement> | undefined}
            title={isMobile ? link.label : undefined}
            className={cn(
              "inline-flex h-full items-center justify-center px-2.5 text-sm font-medium transition-all",
              !isMobile && "px-3",
              isMobile && "bg-muted",
              link.active
                ? "bg-muted text-foreground rounded-md"
                : "hover:bg-muted rounded-md"
            )}
          >
            {link.icon ? (
              <span
                className={cn(
                  "flex h-3.5 w-3.5 items-center justify-center",
                  !isMobile && "mr-1.5"
                )}
              >
                {link.icon}
              </span>
            ) : null}
            {(!isMobile || !link.icon) ? <span>{link.label}</span> : null}
          </button>
        )
      )}
    </div>
  )
}
