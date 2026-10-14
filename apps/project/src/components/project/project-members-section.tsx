import * as React from "react"
import { useNavigate, useRouter } from "@tanstack/react-router"
import { LogOutIcon, MailIcon, PlusIcon, Trash2Icon } from "lucide-react"

import { InviteDialog } from "@/components/project/invite-dialog"
import { PersonAvatar } from "@/components/project/task-bits"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  addMemberToProject,
  removeMemberFromProject,
  type ProjectMemberRow,
  type ProjectPage,
} from "@/lib/api/project/projects"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { TEAM_ROLE_LABEL, runsTheTeam } from "@/lib/project/rules"
import { cn } from "@/lib/utils"

/**
 * The project's members, under its description in the left panel. Only they
 * see the project, and only they can be handed its tasks. Clicking a member
 * shows just their tasks in the middle panel; clicking them again shows
 * everyone's. Invite adds a teammate to the project, and owners and admins
 * can invite someone new to the team from the same menu.
 */
export function ProjectMembersSection({
  page,
  selectedUserId,
  onSelect,
}: {
  page: ProjectPage
  selectedUserId: string | null
  onSelect: (userId: string) => void
}) {
  const router = useRouter()
  const navigate = useNavigate()
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  const [removing, setRemoving] = React.useState<ProjectMemberRow | null>(null)
  const [inviting, setInviting] = React.useState(false)
  // A "Just me" list is one person's, so nobody can be added to it.
  const readOnly = page.project.archived || page.project.personal
  const canInviteToTeam = runsTheTeam(page.myRole)
  const canAdd = !readOnly && (page.addable.length > 0 || canInviteToTeam)
  const leaving = removing?.userId === page.myUserId

  async function add(userId: string) {
    const person = page.addable.find((p) => p.userId === userId)
    const ok = await run(
      () => addMemberToProject(page.project.id, userId),
      person ? `${person.name} added.` : "Member added."
    )
    if (ok) await router.invalidate()
  }

  async function remove(member: ProjectMemberRow) {
    const self = member.userId === page.myUserId
    const ok = await run(
      () => removeMemberFromProject(page.project.id, member.userId),
      self ? `You left ${page.project.name}.` : `${member.name} removed from the project.`
    )
    if (!ok) return
    setRemoving(null)
    // Someone who left may no longer see the page, so they go to Projects.
    if (self) await navigate({ to: "/projects" })
    else await router.invalidate()
  }

  return (
    <section aria-labelledby="project-members-heading" className="grid gap-2">
      <div className="flex min-h-7 items-center justify-between gap-2">
        <h3 id="project-members-heading" className={SECTION_HEADING}>
          Members · {page.members.length}
        </h3>
        {canAdd ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="sm" disabled={busy}>
                <PlusIcon className="size-4" />
                Invite
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>Add a teammate to this project</DropdownMenuLabel>
              {page.addable.length === 0 ? (
                <p className="px-2 py-1.5 text-sm text-muted-foreground">
                  Everyone on the team is on this project.
                </p>
              ) : (
                page.addable.map((person) => (
                  <DropdownMenuItem key={person.userId} onSelect={() => void add(person.userId)}>
                    <PersonAvatar name={person.name} avatarUrl={person.avatarUrl} />
                    <span className="truncate">{person.name}</span>
                  </DropdownMenuItem>
                ))
              )}
              {canInviteToTeam ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setInviting(true)}>
                    <MailIcon className="size-4" />
                    Invite someone new to the team
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
      {page.members.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {canAdd
            ? "Nobody is on this project. Invite a teammate so tasks can be handed to them."
            : "Nobody is on this project."}
        </p>
      ) : (
        <ul className="grid gap-2">
          {page.members.map((member) => {
            const selected = member.userId === selectedUserId
            return (
              <li
                key={member.userId}
                className={cn(
                  "flex items-center gap-1 rounded-lg border bg-muted/40 pr-2",
                  selected && "bg-muted ring-1 ring-ring"
                )}
              >
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onSelect(member.userId)}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2.5 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <PersonAvatar name={member.name} avatarUrl={member.avatarUrl} size="default" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {member.name}
                      {member.userId === page.myUserId ? " (you)" : ""}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {member.title ? `${member.title} · ` : ""}
                      {TEAM_ROLE_LABEL[member.role]} · {member.openTasks} open{" "}
                      {member.openTasks === 1 ? "task" : "tasks"}
                      {selected ? " · showing their tasks" : ""}
                    </span>
                  </span>
                </button>
                {readOnly ? null : member.userId === page.myUserId ? (
                  // An icon, so the row keeps room for the name; the tooltip says what it does.
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Leave project"
                        onClick={() => setRemoving(member)}
                      >
                        <LogOutIcon className="size-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Leave project</TooltipContent>
                  </Tooltip>
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${member.name} from the project`}
                        onClick={() => setRemoving(member)}
                      >
                        <Trash2Icon className="size-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Remove from the project</TooltipContent>
                  </Tooltip>
                )}
              </li>
            )
          })}
        </ul>
      )}
      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(open) => {
          if (!open) setRemoving(null)
        }}
        title={
          leaving
            ? "Leave this project?"
            : removing
              ? `Remove ${removing.name} from the project?`
              : "Remove member?"
        }
        description={
          leaving
            ? runsTheTeam(page.myRole)
              ? "You'll still see it, because owners and admins see every project, but you won't be on it. Your tasks here stay, with nobody assigned and a note saying they were yours."
              : "You'll no longer see it. Your tasks here stay, with nobody assigned and a note saying they were yours."
            : removing
              ? `${removing.name} will no longer see this project. Their tasks here stay, with nobody assigned and a note saying they were ${removing.name}'s.`
              : null
        }
        confirmLabel={leaving ? "Leave project" : "Remove"}
        loading={busy}
        onConfirm={async () => {
          if (removing) await remove(removing)
        }}
      />
      {canInviteToTeam ? <InviteDialog open={inviting} onClose={() => setInviting(false)} /> : null}
    </section>
  )
}

/** The small capital headings of the left panel: Description, Members. */
export const SECTION_HEADING = "text-xs font-medium tracking-wide text-muted-foreground uppercase"
