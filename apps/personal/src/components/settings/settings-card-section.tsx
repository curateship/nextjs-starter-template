import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * A titled block inside a settings card, with a line above it.
 *
 * For a card that holds two or three separate things which belong to the same
 * subject — the public header is its layout, its menu and its user buttons, and
 * an admin thinks of those as one screen rather than three. They were three
 * cards until 25 Sep 2026, when Tyler asked for them together.
 *
 * The line runs edge to edge. A divider inside a padded card stops short of the
 * card's sides and reads as a broken line, so it is pulled out to the card's
 * 16px inset and the content put back inside it.
 */
export function SettingsCardSection({
  title,
  description,
  children,
  className,
}: {
  title: string
  description?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("-mx-4 border-t px-4 pt-4", className)}>
      <div className="grid gap-1">
        <h3 className="font-heading text-base leading-snug font-medium">
          {title}
        </h3>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  )
}
