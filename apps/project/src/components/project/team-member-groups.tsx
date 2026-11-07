import * as React from "react"

import { PersonAvatar } from "@/components/project/task-bits"
import { Button } from "@/components/ui/button"
import type { TeamMemberRow } from "@/lib/api/project/teams"
import { cn } from "@/lib/utils"

/**
 * The Members card's two groups, as Tyler drew them on 16 Oct 2026: Active,
 * then Invited (not signed in yet) under a line, each invited person with a
 * dashed photo and Resend for the site admin. A name opens the person's page.
 */
export function MemberGroups({
  members,
  myUserId,
  canRun,
  busy,
  onOpen,
  onResend,
}: {
  members: TeamMemberRow[]
  myUserId: string
  canRun: boolean
  busy: boolean
  onOpen: (member: TeamMemberRow) => void
  onResend: (member: TeamMemberRow) => void
}) {
  const active = members.filter((member) => !member.invited)
  const invited = members.filter((member) => member.invited)
  const row = (member: TeamMemberRow) => (
    <li key={member.userId} className="flex min-w-0 items-center gap-2">
      <button
        type="button"
        onClick={() => onOpen(member)}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-md py-1 text-left text-sm hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <PersonAvatar
          name={member.name}
          avatarUrl={member.avatarUrl}
          size="default"
          className={member.invited ? "after:border-dashed [&_[data-slot=avatar-fallback]]:bg-transparent" : undefined}
        />
        <span className="grid min-w-0 flex-1">
          <span className={cn("truncate", member.invited ? "text-muted-foreground" : "font-medium")}>
            {member.name}
            {member.userId === myUserId ? " (you)" : ""}
          </span>
          {member.title ? <span className="truncate text-xs text-muted-foreground">{member.title}</span> : null}
        </span>
      </button>
      {canRun && member.invited ? (
        <Button type="button" variant="outline" size="sm" className="shrink-0 bg-background" disabled={busy} onClick={() => onResend(member)}>
          Resend
        </Button>
      ) : null}
    </li>
  )
  return (
    <div className="grid min-w-0 gap-4">
      {active.length ? (
        <MemberGroup label={`Active · ${active.length}`}>{active.map(row)}</MemberGroup>
      ) : null}
      {invited.length ? (
        // The line between the groups runs to the card's edges.
        <div className={cn("grid min-w-0", active.length && "-mx-4 border-t px-4 pt-4")}>
          <MemberGroup label={`Invited · ${invited.length}`}>{invited.map(row)}</MemberGroup>
        </div>
      ) : null}
    </div>
  )
}

function MemberGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section aria-label={label} className="grid min-w-0 gap-2">
      <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</h3>
      <ul className="grid min-w-0 gap-1">{children}</ul>
    </section>
  )
}
