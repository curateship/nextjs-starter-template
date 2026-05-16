"use client"

import * as React from "react"
import { useNavigate } from "@tanstack/react-router"

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
