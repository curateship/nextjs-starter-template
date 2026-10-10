import * as React from "react"
import { useRouter } from "@tanstack/react-router"

import { PersonAvatar } from "@/components/project/task-bits"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  changeTeamMemberRole,
  makeTeamOwner,
  type TeamMemberRow,
} from "@/lib/api/project/teams"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { getProjectErrorMessage } from "@/lib/project/errors"
import {
  TEAM_INVITE_ROLES,
  TEAM_ROLE_LABEL,
  type TeamInviteRole,
  type TeamRole,
} from "@/lib/project/rules"

/**
 * One teammate's role. The role saves the moment it is picked. Only the owner
 * sees the card for handing the team over, and handing it over makes the old
 * owner an admin.
 */
export function MemberDialog({
  member,
  myRole,
  onClose,
}: {
  member: TeamMemberRow | null
  myRole: TeamRole
  onClose: () => void
}) {
  const router = useRouter()
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  const [confirmOwner, setConfirmOwner] = React.useState(false)

  function close() {
    setConfirmOwner(false)
    onClose()
  }

  async function setRole(role: TeamInviteRole) {
    if (!member || role === member.role) return
    const ok = await run(
      () => changeTeamMemberRole({ userId: member.userId, role }),
      `${member.name} is now ${role === "admin" ? "an admin" : "a member"}.`
    )
    if (ok) await router.invalidate()
  }

  async function handOver() {
    if (!member) return
    const ok = await run(() => makeTeamOwner(member.userId), `${member.name} is now the owner.`)
    if (ok) {
      close()
      await router.invalidate()
    }
  }

  return (
    <Dialog open={Boolean(member)} onOpenChange={(open) => (open ? null : close())}>
      <DialogContent variant="admin" className="sm:max-w-lg">
        {member ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <PersonAvatar name={member.name} avatarUrl={member.avatarUrl} />
                {member.name}
              </DialogTitle>
              <DialogDescription>{member.email}</DialogDescription>
            </DialogHeader>
            <DialogBody>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Role</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="member-role">Role</Label>
                    <Select
                      value={member.role}
                      onValueChange={(value) => void setRole(value as TeamInviteRole)}
                      disabled={busy || member.role === "owner"}
                    >
                      <SelectTrigger id="member-role" className="w-full sm:w-fit">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {member.role === "owner" ? (
                          <SelectItem value="owner">{TEAM_ROLE_LABEL.owner}</SelectItem>
                        ) : null}
                        {TEAM_INVITE_ROLES.map((role) => (
                          <SelectItem key={role} value={role}>
                            {TEAM_ROLE_LABEL[role]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Admins can invite and remove people and change the team's settings.
                    </p>
                  </div>
                </CardContent>
              </Card>
              {myRole === "owner" && member.role !== "owner" ? (
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>Ownership</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    <p className="text-sm text-muted-foreground">
                      The owner can hand the team to someone else. You'll become an admin.
                    </p>
                    {confirmOwner ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm">Make {member.name} the owner?</span>
                        <Button type="button" variant="outline" onClick={() => setConfirmOwner(false)}>
                          Cancel
                        </Button>
                        <Button type="button" disabled={busy} onClick={() => void handOver()}>
                          Make owner
                        </Button>
                      </div>
                    ) : (
                      <div>
                        <Button type="button" variant="outline" onClick={() => setConfirmOwner(true)}>
                          Make {member.name} the owner
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ) : null}
            </DialogBody>
            <DialogFooter>
              <Button type="button" onClick={close}>
                Done
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
