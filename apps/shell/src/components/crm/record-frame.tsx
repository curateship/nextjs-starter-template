import type * as React from "react"

import { DashboardCardHeader } from "@/components/shared/dashboard-card-header"
import { SidePanelCollapseButton } from "@/components/shared/three-panels"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { PANEL_FOOTER_PADDING, PANEL_GUTTER } from "@/lib/layout/panel-gutter"
import { cn } from "@/lib/utils"

/**
 * The CRM's one right-panel shape (the Admin 3 panel design, "Right panel";
 * Tyler, 7 Nov 2026: "The Ui is all over the place"). Every record opened on
 * the right is drawn in it: a person, a lead, a newsletter, a template, one of
 * the app's own emails, an outbox email. The conversation panel is the model
 * it was taken from.
 *
 * - **Header:** the record's avatar or icon, its name and one muted line, then
 *   its own buttons (the record ⋮ last), then the collapse button at the edge.
 *   Wrapped in its own div so the shell's table line never matches it.
 * - **Body:** the record, in the panel gutter.
 * - **Footer:** its state on the left and its main button on the right.
 */
export function RecordFrame({
  avatar,
  title,
  line,
  actions,
  body,
  bodyClassName,
  bare = false,
  footer,
  hideLabel,
}: {
  /** Initials as text, drawn in a circle, or an icon, drawn bare. */
  avatar: React.ReactNode
  title: string
  line?: string | null
  /** The record's own header buttons, the ⋮ last. */
  actions?: React.ReactNode
  body: React.ReactNode
  bodyClassName?: string
  /** The body draws its own scrolling, as the email page does. */
  bare?: boolean
  footer?: React.ReactNode
  /** "Hide the person". */
  hideLabel: string
}) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-card">
      <div>
        <DashboardCardHeader className="gap-2">
          {typeof avatar === "string" ? (
            <Avatar size="sm" className="ml-1 shrink-0">
              <AvatarFallback className="text-[0.6875rem] font-medium">{avatar}</AvatarFallback>
            </Avatar>
          ) : (
            // An icon stands on its own, with no circle behind it (Tyler,
            // 7 Nov 2026: "remove icon bg"). A person's initials keep theirs.
            <span className="ml-1 flex size-6 shrink-0 items-center justify-center text-muted-foreground [&_svg]:size-4">
              {avatar}
            </span>
          )}
          <span className="grid min-w-0 flex-1 leading-tight">
            <h2 className="font-heading truncate text-[0.891rem] font-medium">{title}</h2>
            {line ? <span className="truncate text-xs text-muted-foreground">{line}</span> : null}
          </span>
          {actions}
          <SidePanelCollapseButton side="right" label={hideLabel} />
        </DashboardCardHeader>
      </div>
      {bare ? (
        <div className={cn("flex min-h-0 flex-1 flex-col", bodyClassName)}>{body}</div>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <div className={cn("grid grid-cols-[minmax(0,1fr)] content-start", PANEL_GUTTER, bodyClassName)}>
            {body}
          </div>
        </ScrollArea>
      )}
      {footer ? (
        <div className={cn("flex shrink-0 flex-wrap items-center gap-2 border-t", PANEL_FOOTER_PADDING)}>
          {footer}
        </div>
      ) : null}
    </div>
  )
}

/** The footer's left side: the record's state, in words. */
export function FooterState({ children }: { children: React.ReactNode }) {
  // At least 8rem, so a narrow panel wraps the button under the words rather
  // than squeezing the words to nothing.
  return <div className="flex min-w-32 flex-1 items-center gap-2 text-sm">{children}</div>
}

/**
 * The right panel with nothing open: the header naming what will show, then a
 * centred icon and one line. Only a list with no records at all leaves it
 * like this; otherwise the first row opens on arrival.
 */
export function EmptyRecord({
  title,
  icon,
  line,
  loading = false,
  hideLabel,
}: {
  title: string
  icon: React.ReactNode
  line: string
  loading?: boolean
  hideLabel: string
}) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-card">
      <div>
        <DashboardCardHeader className="gap-2.5">
          <h2 className="font-heading min-w-0 flex-1 truncate text-[0.891rem] leading-snug font-medium">{title}</h2>
          <SidePanelCollapseButton side="right" label={hideLabel} />
        </DashboardCardHeader>
      </div>
      <div className="grid min-h-0 flex-1 place-items-center p-6">
        {/* Nothing while a record opens, never a loading circle (Tyler,
            7 Nov 2026: "remove the loading circle... in the right panel"). */}
        {loading ? null : (
          <div className="grid justify-items-center gap-2 text-center text-sm text-muted-foreground [&_svg]:size-6">
            {icon}
            <p className="max-w-56">{line}</p>
          </div>
        )}
      </div>
    </div>
  )
}
