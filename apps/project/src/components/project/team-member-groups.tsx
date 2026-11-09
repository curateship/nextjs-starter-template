import { TileHeading } from "@/components/project/notes/project-block-card"
import { SideRows, type SideRow } from "@/components/shared/notes/side-rows"
import { Button } from "@/components/ui/button"
import type { TeamMemberRow } from "@/lib/api/project/teams"
import { cn } from "@/lib/utils"

/**
 * The Members block's two groups, as Tyler drew them on 16 Oct 2026: Active,
 * then Invited (not signed in yet) under a line, with Resend for the site
 * admin on an invited row. A name opens the person's page. Each person is one
 * of the shell's one-line rows in the block's tile since 9 Nov 2026 (task
 * "Shell look/three-panel-shell-look").
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
  const row = (member: TeamMemberRow): SideRow => ({
    key: member.userId,
    name: `${member.name}${member.userId === myUserId ? " (you)" : ""}`,
    line: member.title ?? undefined,
    onPress: () => onOpen(member),
    menu:
      canRun && member.invited ? (
        <Button type="button" variant="outline" size="sm" className="h-7 bg-background" disabled={busy} onClick={() => onResend(member)}>
          Resend
        </Button>
      ) : undefined,
  })
  if (members.length === 0) return <SideRows rows={[]} empty="Nobody on the team yet." />
  return (
    <>
      {active.length ? (
        <section aria-label={`Active, ${active.length}`} className="grid min-w-0">
          <TileHeading count={active.length}>Active</TileHeading>
          <SideRows rows={active.map(row)} empty="" />
        </section>
      ) : null}
      {invited.length ? (
        <section aria-label={`Invited, ${invited.length}`} className={cn("grid min-w-0", active.length && "border-t")}>
          <TileHeading count={invited.length}>Invited</TileHeading>
          <SideRows rows={invited.map(row)} empty="" />
        </section>
      ) : null}
    </>
  )
}
