import * as React from "react"

import { MemberDialog } from "@/components/project/member-dialog"
import { loadTeamMemberRow } from "@/lib/api/project/team-running"
import type { TeamMemberRow } from "@/lib/api/project/teams"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { OpenPersonContext } from "@/lib/project/person-pages"
import type { TeamRole } from "@/lib/project/rules"
import { showErrorToast } from "@/lib/toast/error-toast"
import { useTeamId } from "@/lib/project/team-scope"

type Shown = { member: TeamMemberRow; myRole: TeamRole; myUserId: string }

/**
 * Lets a name inside it, such as a chat message's author, open that
 * teammate's page (`member-dialog.tsx`). Someone who has left the team can't
 * be opened, and says so.
 */
export function PersonPages({ children }: { children: React.ReactNode }) {
  const teamId = useTeamId()
  const [shown, setShown] = React.useState<Shown | null>(null)
  const [open, setOpen] = React.useState(false)

  const openPerson = React.useCallback((userId: string) => {
    loadTeamMemberRow(userId, teamId).then(
      (found) => {
        setShown(found)
        setOpen(true)
      },
      (error: unknown) => showErrorToast(getProjectErrorMessage(error))
    )
  }, [teamId])

  return (
    <OpenPersonContext.Provider value={openPerson}>
      {children}
      {shown ? (
        <MemberDialog
          member={open ? shown.member : null}
          myRole={shown.myRole}
          myUserId={shown.myUserId}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </OpenPersonContext.Provider>
  )
}
