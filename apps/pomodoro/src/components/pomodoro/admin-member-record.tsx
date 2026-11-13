import * as React from "react"
import { Link } from "@tanstack/react-router"
import {
  ArrowUpRightIcon,
  BotIcon,
  DoorOpenIcon,
  EyeIcon,
  EyeOffIcon,
  FlagIcon,
  FlameIcon,
  FolderIcon,
  ListChecksIcon,
  Loader2Icon,
  NotebookPenIcon,
  PlusIcon,
  SettingsIcon,
  ShieldAlertIcon,
  TargetIcon,
  TimerIcon,
  TrophyIcon,
  Trash2Icon,
  TriangleAlertIcon,
  UploadIcon,
  UserIcon,
  UserMinusIcon,
  UserPlusIcon,
} from "lucide-react"

import { EmptyRecord, FooterState, RecordFrame } from "@/components/crm/record-frame"
import { AdminDeleteConfirm, useAdminDelete } from "@/components/pomodoro/admin-delete"
import { useIsMadeUp } from "@/components/pomodoro/admin-member-name"
import { useSafetyActions } from "@/components/pomodoro/admin-safety-dialogs"
import { PickGroup, PickRow } from "@/components/shared/notes/pick-rows"
import { TabbedMenu } from "@/components/shared/notes/tabbed-menu"
import { PanelCard } from "@/components/shared/panel-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DatePicker } from "@/components/ui/date-picker"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ErrorRow } from "@/components/ui/error-row"
import { FieldLabel } from "@/components/ui/field-label"
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import { LoadingRow } from "@/components/ui/loading-row"
import { Textarea } from "@/components/ui/textarea"
import {
  addPomodoroMemberNote,
  deletePomodoroMemberNote,
  editPomodoroMemberNote,
  fixPomodoroStreakDay,
  getMemberWindowErrorMessage,
  hidePomodoroProfiles,
  loadPomodoroMemberWindow,
  removePomodoroFollowsBy,
  type MemberWindow,
} from "@/lib/api/pomodoro/admin-members"
import {
  getAdminProfileErrorMessage,
  loadPomodoroAdminProfile,
  savePomodoroAdminProfile,
  type AdminProfile,
} from "@/lib/api/pomodoro/admin-profiles"
import { clearPomodoroFocusData } from "@/lib/api/pomodoro/admin"
import { setPomodoroBoardHidden } from "@/lib/api/pomodoro/admin-leaderboard"
import { liftPomodoroSafety } from "@/lib/api/pomodoro/admin-safety"
import { useSelection } from "@/lib/hooks/use-selection"
import {
  getSimulatedErrorMessage,
  loadSimulatedPersonality,
  saveSimulatedPersonality,
} from "@/lib/api/pomodoro/admin-simulated"
import { formatLongDay, formatShortDay } from "@/lib/format/calendar-day"
import { formatFileSize } from "@/lib/format/format-bytes"
import { formatDate, formatDateTime, formatDuration } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { formatFocusHours } from "@/lib/pomodoro/focus-hours"
import { flowflyLink, type FlowflyTab } from "@/lib/pomodoro/flowfly-search"
import {
  BIO_MAX_LENGTH,
  HANDLE_MAX_LENGTH,
  HANDLE_RESERVED_MESSAGE,
  HANDLE_SHAPE_MESSAGE,
  isHandleAvailableShape,
  isHandleShape,
  normalizeHandle,
} from "@/lib/pomodoro/public-profile"
import { PERSONALITY_MAX } from "@/lib/pomodoro/simulated-voice"
import { showErrorToast } from "@/lib/toast/error-toast"

const HIDE_LABEL = "Hide the member"

/**
 * One member on the Flowfly dashboard's right panel (Tyler's picks of
 * 13 Nov 2026: "Member on the right", "One record per person" and "Member
 * owns-everything tabs"). It replaced the member window of admin task 06: a
 * member's name pressed on any list opens them here (`?member=<userId>`), and
 * Profiles, Most blocked and Made-up rows open the same record. Drawn
 * the way the shell's `UserPanel` draws a person:
 *
 * - **Header:** their initials, name, and handle or email, then the ⋮,
 *   which holds what changes them: their profile's handle, display name and
 *   bio, then Warn, Fix a streak day, Hide or Show the profile, Take off or
 *   Put back on the leaderboard, Open in Users, Remove all their follows,
 *   Delete focus data (DELETE typed first) and Suspend.
 * - **Body:** folding cards in the order a support question asks it:
 *   Account, Focus, Sessions, Tasks, Rooms, Reports, Uploads, Badges,
 *   Groups, Projects, Warnings and suspensions, Follows, a made-up member's
 *   Voice, and Admin notes. Each card that lists things ends in Show all,
 *   which opens that tab narrowed to them, where every row has its Delete.
 * - **Footer:** where they stand, and Warn.
 *
 * It reads its own person by id, so it is the same wherever it opens. See
 * `workspace/docs/admin-members.md`.
 */
export function AdminMemberRecord({ userId }: { userId: string }) {
  const [data, setData] = React.useState<MemberWindow | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [attempt, setAttempt] = React.useState(0)
  const [draft, setDraft] = React.useState("")
  const [editing, setEditing] = React.useState<{ id: string; body: string } | null>(null)
  const madeUp = useIsMadeUp(userId)

  const reload = React.useCallback(async () => {
    try {
      setData(await loadPomodoroMemberWindow(userId))
      setError(null)
    } catch (loadError) {
      setError(getMemberWindowErrorMessage(loadError))
    }
  }, [userId])

  React.useEffect(() => {
    let live = true
    loadPomodoroMemberWindow(userId)
      .then((result) => {
        if (live) {
          setData(result)
          setError(null)
        }
      })
      .catch((loadError) => {
        if (live) setError(getMemberWindowErrorMessage(loadError))
      })
    return () => {
      live = false
    }
  }, [userId, attempt])

  const safety = useSafetyActions(reload)
  // Focus data and the leaderboard switch were the Focus and Leaderboard
  // lists' own tools; those lists went on 13 Nov 2026 (Tyler: "we dont need
  // the focus and leaderboard tab"), so they live in this ⋮.
  const noSelection = useSelection()
  const focusDelete = useAdminDelete({
    one: "member",
    many: "members",
    run: clearPomodoroFocusData,
    keptReason: "nothing to clear",
    selection: noSelection,
    onDone: reload,
  })
  const [fixing, setFixing] = React.useState(false)
  const [confirm, setConfirm] = React.useState<"hide" | "follows" | "board" | null>(null)
  const [working, setWorking] = React.useState(false)
  const [menuOpen, setMenuOpen] = React.useState(false)
  const person = data?.person

  const runConfirmed = async () => {
    if (!person || !confirm) return
    setWorking(true)
    try {
      if (confirm === "hide") await hidePomodoroProfiles([person.id])
      else if (confirm === "board") await setPomodoroBoardHidden([person.id], !person.leaderboardHidden)
      else await removePomodoroFollowsBy(person.id)
      setConfirm(null)
      await reload()
    } catch (actionError) {
      showErrorToast(getMemberWindowErrorMessage(actionError))
    } finally {
      setWorking(false)
    }
  }

  const showProfile = async () => {
    if (!person) return
    setWorking(true)
    try {
      await liftPomodoroSafety("hidden", [person.id])
      await reload()
    } catch (actionError) {
      showErrorToast(getMemberWindowErrorMessage(actionError))
    } finally {
      setWorking(false)
    }
  }

  if (!person) {
    return error ? (
      <div className="flex h-full min-h-0 flex-col bg-card">
        <EmptyRecord title="Member" icon={<UserIcon aria-hidden />} line={error} hideLabel={HIDE_LABEL} />
        <div className="p-3">
          <ErrorRow
            message={error}
            onRetry={() => {
              setError(null)
              setAttempt((count) => count + 1)
            }}
          />
        </div>
      </div>
    ) : (
      <EmptyRecord title="Member" icon={<UserIcon aria-hidden />} line="" loading hideLabel={HIDE_LABEL} />
    )
  }

  const running = data.suspensions.find((row) => row.running)
  const act = (run: () => void) => () => {
    setMenuOpen(false)
    run()
  }

  return (
    <>
      <RecordFrame
        avatar={initialsOf(person.name)}
        title={person.name}
        // "Made up" rides in the muted line, not as a badge, so the header
        // keeps its buttons at the narrowest panel.
        line={[madeUp ? "Made up" : null, person.handle ? `@${person.handle}` : null, person.email].filter(Boolean).join(" · ")}
        hideLabel={HIDE_LABEL}
        actions={
          <>
            <TabbedMenu
              label="Member menu"
              align="end"
              width="20.4rem"
              open={menuOpen}
              onOpenChange={setMenuOpen}
              tabs={[
                {
                  value: "general",
                  label: "General",
                  content: (
                    <div className="grid gap-4 p-3">
                      <ProfileRows userId={person.id} hasHandle={Boolean(person.handle)} onSaved={reload} />
                      <div className="grid">
                        <MenuRow icon={<TriangleAlertIcon />} onClick={act(() => safety.warn({ id: person.id, name: person.name }))}>
                          Warn
                        </MenuRow>
                        <MenuRow icon={<FlameIcon />} onClick={act(() => setFixing(true))}>
                          Fix a streak day
                        </MenuRow>
                        {person.handle ? (
                          person.profileHidden ? (
                            <MenuRow icon={<EyeIcon />} onClick={act(() => void showProfile())}>
                              Show profile
                            </MenuRow>
                          ) : (
                            <MenuRow icon={<EyeOffIcon />} onClick={act(() => setConfirm("hide"))}>
                              Hide profile
                            </MenuRow>
                          )
                        ) : null}
                        {person.handle ? (
                          <MenuRow icon={<TrophyIcon />} onClick={act(() => setConfirm("board"))}>
                            {person.leaderboardHidden ? "Put back on the leaderboard" : "Take off the leaderboard"}
                          </MenuRow>
                        ) : null}
                        <MenuRow icon={<ArrowUpRightIcon />} asLink={{ to: "/admin/dashboard", search: { tab: "users", open: person.id } }}>
                          Open in Users
                        </MenuRow>
                        {data.followingCount ? (
                          <MenuRow icon={<UserMinusIcon />} onClick={act(() => setConfirm("follows"))}>
                            Remove all their follows
                          </MenuRow>
                        ) : null}
                        <div className="-mx-3 my-1 border-t" />
                        {data.totals.focusSessions || data.totals.focusSeconds ? (
                          <MenuRow icon={<Trash2Icon />} destructive onClick={act(() => focusDelete.ask([person.id]))}>
                            Delete focus data
                          </MenuRow>
                        ) : null}
                        <MenuRow icon={<ShieldAlertIcon />} destructive onClick={act(() => safety.suspend({ id: person.id, name: person.name }))}>
                          Suspend
                        </MenuRow>
                      </div>
                    </div>
                  ),
                },
              ]}
            />
          </>
        }
        body={
          <MemberSections
            data={data}
            notes={{ draft, setDraft, editing, setEditing, onChanged: reload }}
          />
        }
        footer={
          <>
            <FooterState>
              {running ? (
                <Badge variant="destructive">
                  {running.endsAt ? `Suspended until ${formatDate(running.endsAt)}` : "Suspended until lifted"}
                </Badge>
              ) : (
                <span className="truncate text-muted-foreground">
                  {data.totals.lastFocusedOn ? `Last focused ${formatLongDay(data.totals.lastFocusedOn)}` : "Never focused"}
                </span>
              )}
            </FooterState>
            <Button type="button" variant="outline" onClick={() => safety.warn({ id: person.id, name: person.name })}>
              <TriangleAlertIcon />
              Warn
            </Button>
          </>
        }
      />
      {safety.dialogs}
      <FixStreakDialog open={fixing} data={data} onClose={() => setFixing(false)} onDone={reload} />
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null)
        }}
        title={
          confirm === "hide"
            ? `Hide ${person.name}'s public profile?`
            : confirm === "board"
              ? person.leaderboardHidden
                ? `Put ${person.name} back on the leaderboard?`
                : `Take ${person.name} off the leaderboard?`
              : `Remove every follow ${person.name} made?`
        }
        description={
          confirm === "hide"
            ? "Their page answers like an unknown address, and they are told in the bell. Show it again any time from this ⋮ or from Bans."
            : confirm === "board"
              ? person.leaderboardHidden
                ? "They show on the global board again if their own setting is on, and on their groups' boards. Nobody is told."
                : "They stop showing on the global board and on every focus group's board until an admin puts them back. Their profile, their figures and their own setting stay as they are. They see \"You're not shown on the leaderboard\" in their Settings, and nobody else is told."
              : `They stop following ${data.followingCount} ${plural(data.followingCount, "person", "people")}. Nobody is told, the same as an unfollow. This cannot be undone.`
        }
        confirmLabel={
          confirm === "hide"
            ? "Hide profile"
            : confirm === "board"
              ? person.leaderboardHidden
                ? "Put back"
                : "Take off the board"
              : "Remove follows"
        }
        loading={working}
        onConfirm={() => void runConfirmed()}
      />
      <AdminDeleteConfirm
        del={focusDelete}
        title={`Delete ${person.name}'s focus data?`}
        description={[
          `${data.totals.focusSessions.toLocaleString()} ${plural(data.totals.focusSessions, "session", "sessions")} and ${formatFocusHours(data.totals.focusSeconds)} of focus will be wiped.`,
          "Their Stats, streak, leaderboard place, profile figures and share card all go back to zero.",
          "The account and its tasks, projects, rooms and earned badges stay. A timer still running is left alone.",
          "This cannot be undone.",
        ].join(" ")}
        confirmLabel="Delete focus data"
        typed
      />
    </>
  )
}

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")).toUpperCase() || "?"
}

/** One action row of the ⋮, a ghost button with its icon; the red one sits last under a line. */
function MenuRow({
  icon,
  destructive = false,
  onClick,
  asLink,
  children,
}: {
  icon: React.ReactNode
  destructive?: boolean
  onClick?: () => void
  asLink?: { to: "/admin/dashboard"; search: Record<string, string> }
  children: React.ReactNode
}) {
  const className = `w-full justify-start gap-2 px-2 font-normal [&_svg]:size-4 ${destructive ? "text-destructive hover:text-destructive" : ""}`
  if (asLink) {
    return (
      <Button type="button" variant="ghost" className={className} asChild>
        <Link to={asLink.to} search={asLink.search as never}>
          {icon}
          {children}
        </Link>
      </Button>
    )
  }
  return (
    <Button type="button" variant="ghost" className={className} onClick={onClick}>
      {icon}
      {children}
    </Button>
  )
}

/**
 * The profile's handle, display name and bio as rows of the ⋮ (Tyler's pick
 * "One record per person": the profile window's fields moved here). Each
 * opens a small box; leaving the box saves. The owner is told which fields
 * changed, never which admin changed them, as the window told them.
 */
function ProfileRows({ userId, hasHandle, onSaved }: { userId: string; hasHandle: boolean; onSaved: () => Promise<void> }) {
  const [profile, setProfile] = React.useState<AdminProfile | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const ids = { handle: React.useId(), name: React.useId(), bio: React.useId() }

  React.useEffect(() => {
    if (!hasHandle) return
    let live = true
    loadPomodoroAdminProfile(userId).then(
      (loaded) => {
        if (live) setProfile(loaded)
      },
      (failure) => {
        if (live) setError(getAdminProfileErrorMessage(failure))
      }
    )
    return () => {
      live = false
    }
  }, [hasHandle, userId])

  if (!hasHandle) {
    return (
      <PickGroup title="Profile">
        <PickRow label="Public profile" value="No handle yet" empty disabled>
          {null}
        </PickRow>
      </PickGroup>
    )
  }
  if (error) return <ErrorRow message={error} onRetry={() => setError(null)} />
  if (!profile) return <LoadingRow label="Reading the profile…" />

  const save = async (patch: Partial<{ handle: string; publicDisplayName: string; bio: string }>) => {
    const next = {
      handle: normalizeHandle(patch.handle ?? profile.handle ?? ""),
      publicDisplayName: (patch.publicDisplayName ?? profile.publicDisplayName ?? "").trim() || null,
      bio: (patch.bio ?? profile.bio ?? "").trim() || null,
    }
    if (
      next.handle === profile.handle &&
      next.publicDisplayName === (profile.publicDisplayName ?? null) &&
      next.bio === (profile.bio ?? null)
    ) {
      return
    }
    if (!isHandleAvailableShape(next.handle)) {
      showErrorToast(isHandleShape(next.handle) ? HANDLE_RESERVED_MESSAGE : HANDLE_SHAPE_MESSAGE)
      return
    }
    try {
      await savePomodoroAdminProfile({ userId, ...next })
      setProfile({ ...profile, ...next })
      await onSaved()
    } catch (failure) {
      showErrorToast(getAdminProfileErrorMessage(failure))
    }
  }

  return (
    <PickGroup title="Profile">
      <PickRow label="Handle" value={`@${profile.handle}`}>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
          <FieldLabel htmlFor={ids.handle}>Handle</FieldLabel>
          <Input
            id={ids.handle}
            maxLength={HANDLE_MAX_LENGTH}
            defaultValue={profile.handle ?? ""}
            autoComplete="off"
            onBlur={(event) => void save({ handle: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur()
            }}
          />
          <p className="text-xs text-muted-foreground">Old links to /u/{profile.handle} stop working once it changes.</p>
        </div>
      </PickRow>
      <PickRow label="Display name" value={profile.publicDisplayName || "None"} empty={!profile.publicDisplayName}>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
          <FieldLabel htmlFor={ids.name}>Display name</FieldLabel>
          <Input
            id={ids.name}
            maxLength={50}
            defaultValue={profile.publicDisplayName ?? ""}
            placeholder="Empty shows their handle"
            onBlur={(event) => void save({ publicDisplayName: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur()
            }}
          />
        </div>
      </PickRow>
      <PickRow label="Bio" value={profile.bio || "None"} empty={!profile.bio}>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
          <FieldLabel htmlFor={ids.bio}>Bio</FieldLabel>
          <Textarea
            id={ids.bio}
            rows={1}
            maxLength={BIO_MAX_LENGTH}
            defaultValue={profile.bio ?? ""}
            onBlur={(event) => void save({ bio: event.target.value })}
          />
        </div>
      </PickRow>
    </PickGroup>
  )
}

/** The record's body, in the order a support question asks it. */
function MemberSections({ data, notes }: { data: MemberWindow; notes: NotesState }) {
  const { person, totals } = data
  return (
    <>
      <PanelCard storageId="pomodoro-member-account" icon={<UserIcon />} title="Account">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
          <DetailRow label="Plan" value={person.planName} />
          <DetailRow label="Joined" value={formatDate(person.joinedAt)} />
          <DetailRow
            label="Public profile"
            value={
              person.profileHidden ? (
                <Badge variant="destructive">Hidden by an admin</Badge>
              ) : person.handle && person.profilePublic ? (
                "Public"
              ) : person.handle ? (
                "Switched off"
              ) : (
                "No handle yet"
              )
            }
          />
          <DetailRow
            label="Leaderboard"
            value={person.leaderboardHidden ? "Taken off by an admin" : person.leaderboardOptIn ? "Shown" : "Not opted in"}
          />
        </div>
      </PanelCard>

      <PanelCard storageId="pomodoro-member-focus" icon={<TargetIcon />} title="Focus" meta="All time">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
          <DetailRow label="Focus sessions" value={totals.focusSessions.toLocaleString()} />
          <DetailRow label="Focus time" value={formatFocusHours(totals.focusSeconds)} />
          <DetailRow label="Tasks done" value={totals.tasksCompleted.toLocaleString()} />
          <DetailRow
            label="Last focused"
            value={totals.lastFocusedOn ? formatLongDay(totals.lastFocusedOn) : "Never"}
          />
          <DetailRow
            label="Streak"
            value={`${totals.currentStreak} ${plural(totals.currentStreak, "day", "days")} now, best ${totals.bestStreak}`}
          />
          {data.fixes.length ? (
            <DetailRow label="Days put back" value={data.fixes.map((fix) => formatShortDay(fix.localDate)).join(", ")} />
          ) : null}
        </div>
      </PanelCard>

      <PanelCard storageId="pomodoro-member-sessions" icon={<TimerIcon />} title="Sessions" meta="Last 10">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
          <ShortList
            empty="No sessions yet."
            rows={data.recentSessions.map((row) => ({
              id: row.id,
              main: `${MODE_LABEL[row.mode] ?? row.mode} · ${formatDuration(row.accumulatedSeconds * 1000, { zero: "0m" })}${row.roomName ? ` · ${row.roomName}` : ""}`,
              meta: `${STATUS_LABEL[row.status] ?? row.status} · ${formatDateTime(row.createdAt)}`,
            }))}
          />
          <SeeAll tab="sessions" search={{ user: person.id }} />
        </div>
      </PanelCard>

      <PanelCard
        storageId="pomodoro-member-tasks"
        icon={<ListChecksIcon />}
        title="Open tasks"
        meta={data.openTasks.total.toLocaleString()}
      >
        <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
          <ShortList
            empty="None open."
            rows={data.openTasks.rows.map((row) => ({ id: row.id, main: row.title, meta: formatLongDay(row.plannedDate) }))}
          />
          <SeeAll tab="tasks" search={{ user: person.id }} label="Show every task" />
        </div>
      </PanelCard>

      <PanelCard
        storageId="pomodoro-member-rooms"
        icon={<DoorOpenIcon />}
        title="Rooms"
        meta={`Hosted ${data.hosted.total.toLocaleString()}, joined ${data.joined.total.toLocaleString()}`}
      >
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
          <ShortList
            empty="Has not hosted a room."
            rows={data.hosted.rows.map((row) => ({ id: row.id, main: row.name, meta: `Hosted · ${formatDate(row.at)}` }))}
          />
          {data.joined.rows.length ? (
            <ShortList
              empty=""
              rows={data.joined.rows.map((row) => ({ id: row.id, main: row.name, meta: `Joined · ${formatDate(row.at)}` }))}
            />
          ) : null}
          <SeeAll tab="rooms" search={{ q: person.email }} label="Rooms they host" />
        </div>
      </PanelCard>

      <PanelCard storageId="pomodoro-member-reports" icon={<FlagIcon />} title="Reports">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
          <DetailRow
            label="About them"
            value={`${data.reports.about.toLocaleString()}${data.reports.aboutWaiting ? `, ${data.reports.aboutWaiting} waiting` : ""}`}
          />
          <DetailRow
            label="Filed by them"
            value={`${data.reports.by.toLocaleString()}${data.reports.byDismissed ? `, ${data.reports.byDismissed} dismissed` : ""}`}
          />
          <SeeAll tab="reports" search={{ person: person.id }} />
        </div>
      </PanelCard>

      <PanelCard
        storageId="pomodoro-member-uploads"
        icon={<UploadIcon />}
        title="Uploads"
        meta={data.uploads.total ? `${data.uploads.total.toLocaleString()}, ${formatFileSize(data.uploads.bytes)}` : "0"}
      >
        <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
          <ShortList
            empty="No uploads."
            rows={data.uploads.rows.map((row) => ({
              id: row.mediaId,
              main: row.name,
              meta: `${row.purpose === "sound" ? "Sound" : "Background"} · ${formatFileSize(row.bytes)} · ${formatDate(row.createdAt)}`,
            }))}
          />
          <SeeAll tab="uploads" search={{ user: person.id }} />
        </div>
      </PanelCard>

      <PanelCard storageId="pomodoro-member-owns" icon={<FolderIcon />} title="Badges, groups and projects">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-1">
          <SeeAll tab="badges" search={{ user: person.id }} label="Their badges" />
          <SeeAll tab="groups" search={{ user: person.id }} label="Their groups" />
          <SeeAll tab="projects" search={{ user: person.id }} label="Their projects" />
          <SeeAll tab="tags" search={{ user: person.id }} label="Their task tags" />
          <SeeAll tab="repeats" search={{ user: person.id }} label="Their repeating tasks" />
        </div>
      </PanelCard>

      <PanelCard storageId="pomodoro-member-warnings" icon={<TriangleAlertIcon />} title="Warnings and suspensions">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
          <ShortList
            empty="None."
            rows={[
              ...data.warnings.map((row) => ({
                id: row.id,
                at: new Date(row.createdAt).getTime(),
                main: row.message,
                meta: `Warning · ${formatDateTime(row.createdAt)}`,
              })),
              ...data.suspensions.map((row) => ({
                id: row.id,
                at: new Date(row.createdAt).getTime(),
                main: row.reason,
                meta: `Suspension · ${formatDateTime(row.createdAt)} · ${
                  row.running ? (row.endsAt ? `until ${formatDate(row.endsAt)}` : "until lifted") : row.liftedAt ? "lifted" : "ended"
                }`,
              })),
            ].sort((left, right) => right.at - left.at)}
          />
          <SeeAll tab="bans" search={{ tab: "suspensions", q: person.email }} label="Bans" />
        </div>
      </PanelCard>

      <PanelCard
        storageId="pomodoro-member-follows"
        icon={<UserPlusIcon />}
        title="Follows"
        meta={`Follows ${countLine(data.followingCount, "person", "people")}`}
      >
        <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
          <SeeAll tab="follows" search={{ user: person.id }} />
        </div>
      </PanelCard>

      <VoiceCard userId={person.id} />
      <NotesCard userId={person.id} notes={data.notes} state={notes} />
    </>
  )
}

/**
 * A made-up member's personality line (live activity task 03), added to the
 * style brief on Settings → App settings → Made-up members for every line it
 * says. Drawn only for a made-up account.
 */
function VoiceCard({ userId }: { userId: string }) {
  const madeUp = useIsMadeUp(userId)
  const [saved, setSaved] = React.useState<string | null>(null)
  const [draft, setDraft] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [attempt, setAttempt] = React.useState(0)
  const [busy, setBusy] = React.useState(false)
  const voiceId = React.useId()

  React.useEffect(() => {
    if (!madeUp) return
    let live = true
    loadSimulatedPersonality(userId).then(
      (personality) => {
        if (!live) return
        setSaved(personality)
        setDraft(personality)
        setError(null)
      },
      (failure) => {
        if (live) setError(getSimulatedErrorMessage(failure))
      }
    )
    return () => {
      live = false
    }
  }, [madeUp, userId, attempt])

  if (!madeUp) return null
  return (
    <PanelCard storageId="pomodoro-member-voice" icon={<BotIcon />} title="Voice">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
        <p className="text-sm text-muted-foreground">How this made-up member comes across in room chat, on top of the style brief.</p>
        {error ? (
          <ErrorRow
            message={error}
            onRetry={() => {
              setError(null)
              setAttempt((count) => count + 1)
            }}
          />
        ) : saved === null ? (
          <LoadingRow label="Loading…" />
        ) : (
          <form
            className="grid grid-cols-[minmax(0,1fr)] gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              setBusy(true)
              saveSimulatedPersonality(userId, draft.trim())
                .then((personality) => {
                  setSaved(personality)
                  setDraft(personality)
                })
                .catch((failure) => showErrorToast(getSimulatedErrorMessage(failure)))
                .finally(() => setBusy(false))
            }}
          >
            <FieldLabel htmlFor={voiceId}>Personality</FieldLabel>
            <Textarea
              id={voiceId}
              rows={1}
              maxLength={PERSONALITY_MAX}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
            <div>
              <Button type="submit" variant="outline" disabled={busy}>
                Save voice
              </Button>
            </div>
          </form>
        )}
      </div>
    </PanelCard>
  )
}

const MODE_LABEL: Record<string, string> = { focus: "Focus", short: "Short break", long: "Long break" }
const STATUS_LABEL: Record<string, string> = {
  running: "Running",
  paused: "Paused",
  completed: "Finished",
  cancelled: "Cancelled",
}

function countLine(count: number, one: string, many: string) {
  return `${count.toLocaleString()} ${plural(count, one, many)}`
}

export function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right text-sm font-medium">{value}</span>
    </div>
  )
}

/** A section's short list: one line each, newest first. */
export function ShortList({ rows, empty }: { rows: { id: string; main: string; meta: string }[]; empty: string }) {
  if (!rows.length) return empty ? <p className="text-sm text-muted-foreground">{empty}</p> : null
  return (
    <ul className="grid grid-cols-[minmax(0,1fr)] gap-2">
      {rows.map((row) => (
        <li key={row.id} className="grid min-w-0 gap-0.5">
          <span className="truncate text-sm" title={row.main}>
            {row.main}
          </span>
          <span className="min-w-0 truncate text-xs text-muted-foreground">{row.meta}</span>
        </li>
      ))}
    </ul>
  )
}

/**
 * The way from a card to its full list: that tab of the Flowfly dashboard,
 * narrowed to this person, where every row has its Delete. A ghost button
 * at the foot of the card, as the design puts links that lead away.
 */
export function SeeAll({
  tab,
  search,
  label = "Show all",
}: {
  tab: FlowflyTab
  search: Record<string, string>
  label?: string
}) {
  return (
    <Button type="button" variant="ghost" size="sm" className="justify-self-start" asChild>
      <Link to="/admin/flowfly" search={flowflyLink(tab, search)}>
        {label}
      </Link>
    </Button>
  )
}

// ---------------------------------------------------------------------------
// Fix a streak day
// ---------------------------------------------------------------------------

function FixStreakDialog({
  open,
  data,
  onClose,
  onDone,
}: {
  open: boolean
  data: MemberWindow
  onClose: () => void
  onDone: () => Promise<void>
}) {
  const [day, setDay] = React.useState<Date | undefined>(undefined)
  const [reason, setReason] = React.useState("")
  const [invalid, setInvalid] = React.useState<"day" | "reason" | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [shownFor, setShownFor] = React.useState(false)
  const dayId = React.useId()
  const reasonId = React.useId()
  // Opening starts fresh.
  if (open !== shownFor) {
    setShownFor(open)
    if (open) {
      setDay(undefined)
      setReason("")
      setInvalid(null)
    }
  }
  const localDate = day ? toLocalDate(day) : null

  const save = async () => {
    if (!localDate) {
      setInvalid("day")
      showErrorToast("Pick the day to put back.")
      return
    }
    if (!reason.trim()) {
      setInvalid("reason")
      showErrorToast("Say why. It goes in the record of who changed what.")
      return
    }
    setSaving(true)
    try {
      await fixPomodoroStreakDay(data.person.id, localDate, reason.trim())
      await onDone()
      onClose()
    } catch (error) {
      showErrorToast(getMemberWindowErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormDialog open={open} dirty={Boolean(day) || reason.trim() !== ""} busy={saving} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>Fix a streak day for {data.person.name}</DialogTitle>
            <DialogDescription>
              The day counts for their streak only. Their hours, the leaderboard and their badges do not change. They get a notice: "We restored {localDate ? formatShortDay(localDate) : "that day"} to your streak."
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault()
              void save()
            }}
          >
            <DialogBody>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Day</CardTitle>
                  <CardDescription>
                    Their own calendar day, in {data.person.timezone}. Today there is {formatLongDay(data.today)}.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-[minmax(0,1fr)] gap-4">
                  <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
                    <FieldLabel htmlFor={dayId}>Day to put back</FieldLabel>
                    <DatePicker
                      id={dayId}
                      value={day}
                      onChange={(next) => {
                        setInvalid(null)
                        setDay(next)
                      }}
                      placeholder="Pick a day"
                      className={invalid === "day" ? "border-destructive sm:w-56" : "sm:w-56"}
                    />
                  </div>
                  <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
                    <FieldLabel htmlFor={reasonId}>Reason</FieldLabel>
                    <Input
                      id={reasonId}
                      maxLength={200}
                      value={reason}
                      placeholder={`Outage, ${localDate ? formatShortDay(localDate) : "3 Oct"}`}
                      aria-invalid={invalid === "reason" || undefined}
                      onChange={(event) => {
                        setInvalid(null)
                        setReason(event.target.value)
                      }}
                    />
                  </div>
                </CardContent>
              </Card>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={requestClose} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
                Put the day back
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
}

/** The picked calendar day as `YYYY-MM-DD`, read off the picker's own date. */
function toLocalDate(day: Date) {
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`
}

// ---------------------------------------------------------------------------
// Private admin notes
// ---------------------------------------------------------------------------

type NotesState = {
  draft: string
  setDraft: (draft: string) => void
  editing: { id: string; body: string } | null
  setEditing: (editing: { id: string; body: string } | null) => void
  onChanged: () => Promise<void>
}

function NotesCard({
  userId,
  notes,
  state: { draft, setDraft, editing, setEditing, onChanged },
}: {
  userId: string
  notes: MemberWindow["notes"]
  state: NotesState
}) {
  const [deleting, setDeleting] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const draftId = React.useId()
  const editId = React.useId()

  const run = async (work: () => Promise<unknown>, after: () => void) => {
    setBusy(true)
    try {
      await work()
      after()
      await onChanged()
    } catch (error) {
      showErrorToast(getMemberWindowErrorMessage(error))
      await onChanged()
    } finally {
      setBusy(false)
    }
  }

  return (
    <PanelCard storageId="pomodoro-member-notes" icon={<NotebookPenIcon />} title="Admin notes">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
        <p className="text-sm text-muted-foreground">Only admins see these. Every change is logged.</p>
        <form
          className="grid grid-cols-[minmax(0,1fr)] gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            if (!draft.trim()) {
              showErrorToast("Write the note first.")
              return
            }
            void run(() => addPomodoroMemberNote(userId, draft.trim()), () => setDraft(""))
          }}
        >
          <FieldLabel htmlFor={draftId}>New note</FieldLabel>
          <Textarea id={draftId} rows={1} maxLength={2000} value={draft} onChange={(event) => setDraft(event.target.value)} />
          <div>
            <Button type="submit" variant="outline" disabled={busy}>
              <PlusIcon className="size-4" />
              Add note
            </Button>
          </div>
        </form>
        {notes.length ? (
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-4">
            {notes.map((note) => (
              <li key={note.id} className="grid min-w-0 gap-1">
                {editing?.id === note.id ? (
                  <form
                    className="grid grid-cols-[minmax(0,1fr)] gap-2"
                    onSubmit={(event) => {
                      event.preventDefault()
                      if (!editing.body.trim()) {
                        showErrorToast("A note cannot be empty. Delete it instead.")
                        return
                      }
                      void run(() => editPomodoroMemberNote(note.id, editing.body.trim()), () => setEditing(null))
                    }}
                  >
                    <FieldLabel htmlFor={editId} className="sr-only">
                      Edit note
                    </FieldLabel>
                    <Textarea
                      id={editId}
                      rows={1}
                      maxLength={2000}
                      value={editing.body}
                      onChange={(event) => setEditing({ id: note.id, body: event.target.value })}
                    />
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" onClick={() => setEditing(null)} disabled={busy}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={busy}>
                        Save changes
                      </Button>
                    </div>
                  </form>
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 text-sm break-words whitespace-pre-wrap">{note.body}</p>
                    <div className="flex shrink-0">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Edit note"
                        disabled={busy}
                        onClick={() => setEditing({ id: note.id, body: note.body })}
                      >
                        <SettingsIcon className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Delete note"
                        disabled={busy}
                        onClick={() => setDeleting(note.id)}
                      >
                        <Trash2Icon className="size-4" />
                      </Button>
                    </div>
                  </div>
                )}
                <span className="text-xs text-muted-foreground">
                  {note.writtenBy ?? "A former admin"} · {formatDateTime(note.createdAt)}
                  {note.updatedAt ? ` · edited by ${note.updatedBy ?? "a former admin"} ${formatDateTime(note.updatedAt)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No notes yet.</p>
        )}
      </div>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title="Delete this note?"
        description="Every admin loses it. The record of who deleted it stays. This cannot be undone."
        confirmLabel="Delete note"
        loading={busy}
        onConfirm={() => {
          const id = deleting
          if (id) void run(() => deletePomodoroMemberNote(id), () => setDeleting(null))
        }}
      />
    </PanelCard>
  )
}
