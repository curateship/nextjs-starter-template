import type * as React from "react"

/**
 * What a panel says while it is still empty.
 *
 * Deliberately the panel's real empty state rather than a "coming soon" box:
 * these same words are what a new account sees on the finished page, before a
 * market is picked or an account is connected. Writing them now means the empty
 * page gets designed once, at the start, instead of being patched on at the end.
 */
export function PanelPlaceholder({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center gap-2 px-6 py-8 text-center">
      <span
        className="flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground"
        aria-hidden
      >
        {icon}
      </span>
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-64 text-xs text-muted-foreground">{children}</p>
    </div>
  )
}
