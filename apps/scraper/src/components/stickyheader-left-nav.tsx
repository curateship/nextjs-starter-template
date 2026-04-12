"use client"

import * as React from "react"

import { useIsMobile } from "../hooks/use-mobile"
import { cn } from "../lib/utils"

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

function shouldUseAnchor(href?: string) {
  if (!href) {
    return false
  }

  return (
    href.startsWith("#") ||
    href.startsWith("http://") ||
    href.startsWith("https://") ||
    href.startsWith("mailto:")
  )
}

export function StickyHeaderLeftNav({
  navLinks,
}: StickyHeaderLeftNavProps) {
  const isMobile = useIsMobile()

  if (!navLinks.length) {
    return null
  }

  return (
    <div className="inline-flex h-8 items-center rounded-md gap-1">
      {navLinks.map((link) =>
        shouldUseAnchor(link.href) ? (
          <a
            key={`${link.href}-${link.label}`}
            href={link.href}
            target={link.external ? "_blank" : undefined}
            rel={link.external ? "noreferrer" : undefined}
            aria-label={isMobile ? link.label : undefined}
            onClick={link.onClick as React.MouseEventHandler<HTMLAnchorElement> | undefined}
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
            {!isMobile ? <span>{link.label}</span> : null}
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
            {!isMobile ? <span>{link.label}</span> : null}
          </button>
        )
      )}
    </div>
  )
}
