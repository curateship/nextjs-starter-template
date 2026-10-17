import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { CheckIcon, ChevronsUpDownIcon, Loader2Icon, PlusIcon } from "lucide-react"

import { useCreateTeam } from "@/components/project/use-create-team"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { FormDialog } from "@/components/ui/form-dialog"
import type { AppHeaderLeftContentProps } from "@/lib/app-options"
import { loadPickerTeams, pickProjectTeam, type PickerTeam } from "@/lib/api/project/teams"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { getProjectErrorMessage } from "@/lib/project/errors"

type Picker = { teams: PickerTeam[]; currentId: string | null }

/**
 * The site admin's team picker, at the left of the header on every page
 * (Tyler, 16 Oct 2026: "Im admin, I should be able to see everything"). The
 * site admin is on no team, so this says which one every Project page shows.
 * Every team by name, then New team. The pick is saved on the server, so it
 * holds on every device. Only the site admin is handed this
 * (`header.leftContent` with `roles: ["admin"]` in `src/app/options.ts`).
 */
export default function TeamPickerHeader({ fallback }: AppHeaderLeftContentProps) {
  const router = useRouter()
  const [picker, setPicker] = React.useState<Picker | null>(null)
  const [creating, setCreating] = React.useState(false)
  const [run, busy] = useAsyncAction(getProjectErrorMessage)

  // Read again on each opening, so a team made elsewhere is offered.
  const [tries, setTries] = React.useState(0)
  const load = () => setTries((count) => count + 1)

  React.useEffect(() => {
    let live = true
    loadPickerTeams().then(
      (found) => live && setPicker(found),
      () => live && setPicker(null)
    )
    return () => {
      live = false
    }
  }, [tries])

  async function pick(team: PickerTeam) {
    if (team.id === picker?.currentId) return
    const ok = await run(() => pickProjectTeam(team.id))
    if (!ok) return
    setPicker((was) => (was ? { ...was, currentId: team.id } : was))
    await router.invalidate()
  }

  const current = picker?.teams.find((team) => team.id === picker.currentId) ?? null

  return (
    <div className="flex min-w-0 items-center gap-2">
      <DropdownMenu onOpenChange={(open) => open && load()}>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" className="max-w-56 min-w-0" disabled={!picker}>
            {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
            <span className="truncate">{current?.name ?? (picker ? "No team yet" : "Teams")}</span>
            <ChevronsUpDownIcon className="size-4 shrink-0 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel>Teams</DropdownMenuLabel>
          {picker?.teams.length ? (
            picker.teams.map((team) => (
              <DropdownMenuItem key={team.id} onSelect={() => void pick(team)}>
                <span className="min-w-0 flex-1 truncate">{team.name}</span>
                {team.id === picker.currentId ? <CheckIcon className="size-4" /> : null}
              </DropdownMenuItem>
            ))
          ) : (
            <DropdownMenuItem disabled>No teams yet</DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setCreating(true)}>
            <PlusIcon className="size-4" />
            New team
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <div className="hidden min-w-0 md:block">{fallback}</div>
      <NewTeamDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={() => {
          setCreating(false)
          load()
        }}
      />
    </div>
  )
}

function NewTeamDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: () => void
}) {
  const team = useCreateTeam(onCreated)
  return (
    <FormDialog open={open} dirty={team.dirty} busy={team.busy} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New team</DialogTitle>
            <DialogDescription>
              You run it without being on it. The picker moves to it once it's made.
            </DialogDescription>
          </DialogHeader>
          <form className="flex min-h-0 flex-1 flex-col" onSubmit={(event) => void team.create(event)}>
            <DialogBody>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Team</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">{team.fields}</CardContent>
              </Card>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={requestClose} disabled={team.busy}>
                Cancel
              </Button>
              <Button type="submit" disabled={team.busy}>
                {team.busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
                Create team
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
}
