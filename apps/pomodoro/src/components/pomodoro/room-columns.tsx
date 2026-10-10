import type * as React from "react"
import { Link } from "@tanstack/react-router"
import { Loader2Icon, PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { InitialsAvatar } from "@/components/pomodoro/initials-avatar"
import type { RoomSnapshotClient } from "@/components/pomodoro/active-room"
import { cn } from "@/lib/utils"

/**
 * The three rooms you can be in, side by side at the top of `/rooms`: your
 * personal room, a room you joined, and the room you host. You are in exactly
 * one of them at a time, so exactly one column is lit. Tyler, 7 Oct 2026:
 * "Only one of this room should be highlighed because I can only be on one
 * room at a time."
 *
 * The personal room always has a card, because it can never be deleted. The
 * other two are a dashed box with a way in whenever you are not in one.
 */
export function RoomColumns({
  activeRoom,
  ownerName,
  leaving,
  onBackToPersonal,
  onBrowse,
  onHost,
  hostNote,
}: {
  /** The hosted room you are in, as a member or its host; null is your own. */
  activeRoom: RoomSnapshotClient | null
  /** Your account name, for "Tyler's room". */
  ownerName: string
  /** True while a Go back is leaving the room you are in. */
  leaving: boolean
  onBackToPersonal: () => void
  onBrowse: () => void
  /** Missing for a guest, who cannot host. */
  onHost?: () => void
  /** The tooltip on Host a room: which room hosting takes you out of. */
  hostNote: string
}) {
  const role = activeRoom?.you.role ?? null
  const firstName = ownerName.trim().split(/\s+/)[0] || "Your"
  const personalTitle = firstName === "Your" ? "Your room" : `${firstName}'s room`

  return (
    <section
      aria-label="Your rooms"
      className="grid gap-4 md:grid-cols-3"
    >
      <RoomColumn label="My personal room" here={role === null}>
        <RoomIdentity
          avatarName={ownerName || "You"}
          title={personalTitle}
          line="Always open · just you"
        />
        {role === null ? (
          <Button asChild className="self-start rounded-full">
            <Link to="/">Open room</Link>
          </Button>
        ) : (
          <Button
            variant="outline"
            className="self-start rounded-full"
            disabled={leaving}
            onClick={onBackToPersonal}
          >
            {leaving ? (
              <Loader2Icon className="animate-spin" aria-hidden="true" />
            ) : null}
            Go back to it
          </Button>
        )}
      </RoomColumn>

      {role === "member" && activeRoom ? (
        <ActiveRoomColumn
          label="Room I joined"
          snapshot={activeRoom}
          leaving={leaving}
          onLeave={onBackToPersonal}
        />
      ) : (
        <EmptyRoomColumn label="Room I joined">
          <p>
            You can sit in one room at a time.
            <br />
            Pick an open room below.
          </p>
          <Button
            variant="outline"
            className="rounded-full"
            onClick={onBrowse}
          >
            Browse open rooms
          </Button>
        </EmptyRoomColumn>
      )}

      {role === "host" && activeRoom ? (
        <ActiveRoomColumn
          label="My hosted room"
          snapshot={activeRoom}
          leaving={leaving}
          onLeave={onBackToPersonal}
        />
      ) : (
        <EmptyRoomColumn label="My hosted room">
          {onHost ? (
            <>
              <p>Start a room, run the timer and invite people in.</p>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    className="rounded-full"
                    onClick={onHost}
                  >
                    <PlusIcon aria-hidden="true" />
                    Host a room
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{hostNote}</TooltipContent>
              </Tooltip>
            </>
          ) : (
            <p>Sign in to host your own room.</p>
          )}
        </EmptyRoomColumn>
      )}
    </section>
  )
}

/**
 * A hosted room you are in: its name, its host, the way back into it, and a
 * way out. Tyler, 9 Oct 2026: "add a leave room button here". Leaving asks
 * first, the same as Go back to it, because a host leaving closes the room.
 */
function ActiveRoomColumn({
  label,
  snapshot,
  leaving,
  onLeave,
}: {
  label: string
  snapshot: RoomSnapshotClient
  leaving: boolean
  onLeave: () => void
}) {
  const host = snapshot.members.find((member) => member.role === "host")
  const count = snapshot.members.length
  return (
    <RoomColumn label={label} here>
      <RoomIdentity
        avatarName={host?.name ?? snapshot.room.name}
        title={snapshot.room.name}
        line={`${count} focusing${snapshot.you.role === "host" ? " · you host" : host ? ` · hosted by ${host.name}` : ""}`}
      />
      <div className="flex flex-wrap gap-2">
        <Button asChild className="rounded-full">
          <Link to="/">Open room</Link>
        </Button>
        <Button
          variant="outline"
          className="rounded-full"
          disabled={leaving}
          onClick={onLeave}
        >
          {leaving ? (
            <Loader2Icon className="animate-spin" aria-hidden="true" />
          ) : null}
          {snapshot.you.role === "host" ? "Leave & close" : "Leave room"}
        </Button>
      </div>
    </RoomColumn>
  )
}

/** A filled column. Lit in the accent colour when it is where you are. */
function RoomColumn({
  label,
  here,
  children,
}: {
  label: string
  here: boolean
  children: React.ReactNode
}) {
  return (
    <article
      aria-label={label}
      aria-current={here ? "true" : undefined}
      className={cn(
        "flex min-h-[210px] flex-col gap-5 rounded-[24px] border-2 p-6",
        here
          ? "border-[color:var(--p-accent)] bg-[radial-gradient(ellipse_at_top_right,color-mix(in_srgb,var(--p-accent)_18%,transparent),transparent_70%),var(--p-surface)]"
          : "border-[rgba(var(--p-fg-rgb),0.1)] bg-[var(--p-surface)]"
      )}
    >
      <header className="flex items-center justify-between gap-3">
        <ColumnLabel>{label}</ColumnLabel>
        {here ? (
          <span className="flex items-center gap-1.5 rounded-full bg-[color:var(--p-accent)]/15 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--p-accent-2)]">
            <i
              aria-hidden="true"
              className="size-1.5 rounded-full bg-[var(--p-accent)]"
            />
            You&apos;re here
          </span>
        ) : null}
      </header>
      {children}
    </article>
  )
}

/** A dashed box for a room you are not in, with the way to get one. */
function EmptyRoomColumn({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <article
      aria-label={label}
      className="flex min-h-[210px] flex-col gap-4 rounded-[24px] border-2 border-dashed border-[rgba(var(--p-fg-rgb),0.16)] p-6"
    >
      <ColumnLabel>{label}</ColumnLabel>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center text-[var(--p-text-subtle)]">
        {children}
      </div>
    </article>
  )
}

function ColumnLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="font-mono text-[11px] font-normal uppercase tracking-[0.2em] text-muted-foreground">
      {children}
    </h3>
  )
}

/** Initials with a green dot, the room's name, and one line under it. */
function RoomIdentity({
  avatarName,
  title,
  line,
}: {
  avatarName: string
  title: string
  line: string
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="relative shrink-0">
        <InitialsAvatar name={avatarName} className="size-11 text-sm" />
        <i
          aria-hidden="true"
          className="absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2 border-[var(--p-surface)] bg-[var(--p-success)]"
        />
      </span>
      <div className="flex min-w-0 flex-col">
        <strong className="truncate text-lg">{title}</strong>
        <span className="truncate text-sm text-muted-foreground">{line}</span>
      </div>
    </div>
  )
}
