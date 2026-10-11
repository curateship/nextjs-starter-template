import * as React from "react"
import { useNavigate, useRouter } from "@tanstack/react-router"
import { LogOutIcon, Trash2Icon, UsersIcon } from "lucide-react"

import { PersonAvatar } from "@/components/project/task-bits"
import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
 * The project's members. Only they see the project, and only they can be
 * handed its tasks. Clicking a member shows just their tasks in the middle
 * panel; clicking them again shows everyone's.
 */
export function ProjectMembersPanel({
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
  // A "Just me" list is one person's, so nobody can be added to it.
  const readOnly = page.project.archived || page.project.personal
  const canAdd = !readOnly && page.addable.length > 0
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
    <>
      <DashboardCardTitleHeader
        icon={<UsersIcon className="size-4" />}
        title="Members"
        meta={String(page.members.length)}
      />
      {canAdd ? (
        <div className="border-b p-3">
          {/* A pick adds the person at once, so the control always reads
              "Add member" rather than holding the last choice. */}
          <Select value="" onValueChange={(userId) => void add(userId)} disabled={busy}>
            <SelectTrigger aria-label="Add a teammate to this project" className="w-full">
              <SelectValue placeholder="Add member" />
            </SelectTrigger>
            <SelectContent>
              {page.addable.map((person) => (
                <SelectItem key={person.userId} value={person.userId}>
                  <PersonAvatar name={person.name} avatarUrl={person.avatarUrl} />
                  {person.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full">
        {page.members.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            {canAdd
              ? "Nobody is on this project. Add a teammate so tasks can be handed to them."
              : "Nobody is on this project."}
          </p>
        ) : (
          <ul className="divide-y">
            {page.members.map((member) => {
              const selected = member.userId === selectedUserId
              return (
                <li key={member.userId} className="flex items-center gap-1 pr-2">
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onSelect(member.userId)}
                    className={cn(
                      "flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                      selected && "bg-muted"
                    )}
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
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${member.name} from the project`}
                      onClick={() => setRemoving(member)}
                    >
                      <Trash2Icon className="size-4" />
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </ScrollArea>
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
    </>
  )
}
