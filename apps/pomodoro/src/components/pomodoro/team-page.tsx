import * as React from "react"
import { Link } from "@tanstack/react-router"

import { FlagIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { GroupReportDialog } from "@/components/pomodoro/group-report-dialog"
import { InitialsAvatar } from "@/components/pomodoro/initials-avatar"
import { LeaderboardRows } from "@/components/pomodoro/leaderboard-rows"
import { PanelCard } from "@/components/pomodoro/panel-card"
import type { readTeamPage } from "@/lib/api/pomodoro/teams"
import { plural } from "@/lib/format/plural"
import { contentColumn } from "@/lib/pomodoro/content-column"
import { formatFocusDuration } from "@/lib/pomodoro/focus-history"
import {
  LEADERBOARD_WINDOWS,
  LEADERBOARD_WINDOW_LABELS,
  type LeaderboardWindow,
} from "@/lib/pomodoro/leaderboard-windows"
import { pillTabsList, pillTabsTrigger } from "@/lib/pomodoro/pill-tabs"

type TeamPageView = NonNullable<Awaited<ReturnType<typeof readTeamPage>>>

/**
 * The page at `/team/<handle>`: a focus group's people and their hours.
 *
 * It draws what arrived and asks for nothing. The server already decided who
 * is ranked, who is named with no figures and who is only counted, from each
 * member's own public page switches, so there is no "should I show this" in
 * this file. The owner sees exactly what a stranger sees, plus an Edit
 * button.
 */
export function TeamPage({ team }: { team: TeamPageView }) {
  const [boardWindow, setBoardWindow] =
    React.useState<LeaderboardWindow>("week")
  const [reporting, setReporting] = React.useState(false)
  const board = team.boards[boardWindow]
  // Everybody ranked publishes their hours in every window, so the all-time
  // board is the one list of who publishes.
  const publishers = team.boards.all.length

  return (
    <div className={`${contentColumn} flex flex-col gap-6 py-8`}>
      <section
        aria-label={team.name}
        className="overflow-hidden rounded-[24px] border bg-[var(--p-surface)]"
      >
        <div className="flex flex-col gap-4 p-5 sm:p-6 md:flex-row md:items-start">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              {/* A long name with no spaces breaks rather than pushing past
                  the card on a phone. */}
              <h1 className="min-w-0 break-words text-3xl font-bold tracking-tight md:text-4xl">
                {team.name}
              </h1>
              <span className="min-w-0 break-all font-mono text-sm text-muted-foreground">
                /team/{team.handle}
              </span>
            </div>
            {team.description ? (
              <p className="break-words">{team.description}</p>
            ) : null}
            <p className="text-sm text-muted-foreground">
              <strong className="font-semibold text-foreground">
                {team.memberCount}
              </strong>{" "}
              {plural(team.memberCount, "member")}
              {" · "}
              {publishers} {plural(publishers, "shows", "show")} their hours
            </p>
          </div>
          {team.isOwner && team.groupId ? (
            <Button asChild variant="outline" className="h-10 self-start rounded-full px-4">
              <Link to="/groups" search={{ group: team.groupId }}>
                Edit page
              </Link>
            </Button>
          ) : (
            // Groups task 01, part 24. Anybody can report a team page, signed
            // in or not, the same as a public profile.
            <Button
              variant="ghost"
              className="self-start"
              onClick={() => setReporting(true)}
            >
              <FlagIcon aria-hidden="true" />
              Report
            </Button>
          )}
          <GroupReportDialog
            open={reporting}
            onOpenChange={setReporting}
            groupName={team.name}
            target={{ handle: team.handle }}
          />
        </div>
        {/* The 1px gap shows the line colour behind the cells, the same
            lines the profile header draws. */}
        <dl className="grid grid-cols-1 gap-px border-t bg-[rgba(var(--p-fg-rgb),0.08)] sm:grid-cols-3">
          {LEADERBOARD_WINDOWS.map((window) => (
            <div
              key={window}
              className="flex flex-col gap-2 bg-[var(--p-surface)] p-5 sm:p-6"
            >
              <dt className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                {LEADERBOARD_WINDOW_LABELS[window]}
              </dt>
              <dd className="text-3xl font-bold tracking-tight">
                {formatFocusDuration(
                  team.boards[window].reduce(
                    (sum, row) => sum + row.focusSeconds,
                    0
                  )
                )}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <PanelCard
        label="Hours by member"
        aside={
          <Tabs
            value={boardWindow}
            onValueChange={(value) => setBoardWindow(value as LeaderboardWindow)}
          >
            <TabsList aria-label="Which hours" className={pillTabsList}>
              {LEADERBOARD_WINDOWS.map((window) => (
                <TabsTrigger key={window} value={window} className={pillTabsTrigger}>
                  {LEADERBOARD_WINDOW_LABELS[window]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        }
      >
        {board.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">
            Nobody in this team shows their hours on their own public page yet.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <LeaderboardRows leaders={board} />
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Only members who show their hours on their own public page are
          ranked. Days are counted in UTC.
        </p>
      </PanelCard>

      {team.quiet.length > 0 || team.unnamedCount > 0 ? (
        <PanelCard label="Also in the team">
          {team.quiet.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {team.quiet.map((member) => (
                <li
                  key={member.handle}
                  className="flex min-h-14 items-center gap-3 px-3 sm:gap-4 sm:px-4"
                >
                  <InitialsAvatar
                    name={member.name}
                    className="size-8 text-xs sm:size-9 sm:text-sm"
                  />
                  <Link
                    to="/u/$handle"
                    params={{ handle: member.handle }}
                    className="min-w-0 truncate text-base font-semibold underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {member.name}
                  </Link>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                    Keeps their hours private
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {team.unnamedCount > 0 ? (
            <p className="text-sm text-muted-foreground">
              {team.unnamedCount === 1
                ? "1 more member has no public page, so is not named here."
                : `${team.unnamedCount} more members have no public page, so are not named here.`}
            </p>
          ) : null}
        </PanelCard>
      ) : null}
    </div>
  )
}
