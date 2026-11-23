import { getRouteApi } from "@tanstack/react-router"
import { Loader2Icon, UsersIcon } from "lucide-react"

import { useCreateTeam } from "@/components/project/use-create-team"
import { CardTop, FeedCard } from "@/components/shared/feed-card"
import { Button } from "@/components/ui/button"
import { pageGutter } from "@/lib/layout/shell-gutter"

const authenticatedRoute = getRouteApi("/_authenticated")

/**
 * What someone sees before they are on a team. Only the site admin makes
 * teams, so they get a way to start one; an employee is told the site admin
 * puts them on one. Every Project screen shows this in place of its own
 * content until there is a team.
 */
export function TeamStart() {
  const siteAdmin = authenticatedRoute.useLoaderData().user.role === "admin"
  return (
    <div className="grid max-w-2xl" style={{ gap: pageGutter }}>
      {siteAdmin ? (
        <CreateTeamCard />
      ) : (
        <FeedCard>
          <CardTop icon={UsersIcon} title="Not on a team yet" />
          <p className="p-4 text-sm text-muted-foreground sm:p-5">
            The site admin puts you on a team. Once they do, your tasks and check-in show here.
          </p>
        </FeedCard>
      )}
    </div>
  )
}

function CreateTeamCard() {
  const team = useCreateTeam()
  return (
    <FeedCard>
      <CardTop icon={UsersIcon} title="Start a team" />
      <div className="grid gap-4 p-4 sm:p-5">
        <p className="text-sm text-muted-foreground">
          You run the team without being on it: you see everything, and nobody sees you in its lists.
          Invite your people once it's made.
        </p>
        <form className="grid gap-4" onSubmit={(event) => void team.create(event)}>
          {team.fields}
          <div>
            <Button type="submit" disabled={team.busy}>
              {team.busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
              Create team
            </Button>
          </div>
        </form>
      </div>
    </FeedCard>
  )
}
