import * as React from "react"
import { ArrowDownIcon, LogInIcon, LogOutIcon, MusicIcon } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useRoomClock } from "@/lib/pomodoro/room-clock-store"
import { sceneFor, soundLabelFor } from "@/lib/pomodoro/media-pair"
import { useMediaCatalog } from "@/lib/pomodoro/room-media-store"
import { vibeFor } from "@/lib/pomodoro/room-vibe"
import { cn } from "@/lib/utils"

/**
 * The question before joining a room while you are in another (Tyler, 11 Oct
 * 2026: "if I join a room while I'm in another room then a modal confirmation
 * will popup telling me that I would leave the currant room I'm in and also
 * show me the room name, background and sound"). Both rooms are shown, the one
 * you leave and the one you join, each with its picture, name and sound. When
 * you host the room you are in, joining closes it for everyone, and the
 * question says so. See "Joining while in another room" in
 * `workspace/docs/rooms.md`.
 *
 * Used wherever a join starts: Open to join on `/` and `/rooms`, and the
 * invite page.
 */

type RoomPreview = {
  slug: string
  name: string
  /** `scene:<key>`, or null for a room without one. */
  background: string | null
  /** `curated:<key>` and the rest, or null. */
  sound: string | null
}

/** What the question shows of a room on a card. */
export function previewOf(row: { room: RoomPreview }): RoomPreview {
  return { slug: row.room.slug, name: row.room.name, background: row.room.background, sound: row.room.sound }
}

type Asking = { target: RoomPreview; proceed: () => void }

export function useSwitchRoomConfirm() {
  const { snapshot } = useRoomClock()
  const [asking, setAsking] = React.useState<Asking | null>(null)

  /** Joins at once when you are in no room, or in this one; asks first otherwise. */
  const confirmJoin = React.useCallback(
    (target: RoomPreview, proceed: () => void) => {
      if (!snapshot || snapshot.room.slug === target.slug) {
        proceed()
        return
      }
      setAsking({ target, proceed })
    },
    [snapshot]
  )

  const current = snapshot?.room ?? null
  const hosting = snapshot?.you.role === "host"
  const dialog =
    asking && current ? (
      <ConfirmDialog
        open
        onOpenChange={(open) => {
          if (!open) setAsking(null)
        }}
        title={`Join ${asking.target.name}?`}
        description={
          hosting
            ? `You host ${current.name}. Joining ${asking.target.name} closes your room and ends it for everyone in it.`
            : `You are in ${current.name}. Joining ${asking.target.name} takes you out of it.`
        }
        confirmLabel={hosting ? "Close my room and join" : "Leave and join"}
        destructive={hosting}
        onConfirm={() => {
          const { proceed } = asking
          setAsking(null)
          proceed()
        }}
      >
        {/* Leaving above, faded, and joining below, lit, with an arrow
            between, so which is which reads at a glance (Tyler, 11 Oct 2026:
            "Make what the user leave and what the user will join more
            obvious"). */}
        <div className="grid justify-items-center gap-2">
          <RoomPreviewRow
            way="leave"
            label={hosting ? "Closing" : "Leaving"}
            room={{ slug: current.slug, name: current.name, background: current.background, sound: current.sound }}
          />
          <ArrowDownIcon className="size-5 text-muted-foreground" aria-hidden="true" />
          <RoomPreviewRow way="join" label="Joining" room={asking.target} />
        </div>
      </ConfirmDialog>
    ) : null

  return { confirmJoin, dialog }
}

function RoomPreviewRow({ way, label, room }: { way: "leave" | "join"; label: string; room: RoomPreview }) {
  const catalog = useMediaCatalog()
  const scene = sceneFor(catalog, room.background)
  const sound = soundLabelFor(catalog, room.sound)
  const Icon = way === "leave" ? LogOutIcon : LogInIcon
  return (
    // An outline, not a border: the card's border follows the Styling
    // settings and would hide an orange one.
    <Card size="sm" className={cn("w-full", way === "join" ? "outline-2 outline-primary" : "opacity-70")}>
      <CardContent className="grid gap-3">
        <span
          className={cn(
            "flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide",
            way === "leave" ? "text-destructive" : "text-primary"
          )}
        >
          <Icon className="size-4" aria-hidden="true" />
          {label}
        </span>
        <span className="flex items-center gap-3">
          {/* The room's picture, or its gradient when it has none. */}
          <span
            aria-hidden="true"
            className={cn("relative h-16 w-28 shrink-0 overflow-hidden rounded-md bg-muted", way === "leave" && "grayscale")}
            style={scene ? undefined : { backgroundImage: vibeFor(room.slug) }}
          >
            {scene?.stillUrl ? <img src={scene.stillUrl} alt="" className="absolute inset-0 size-full object-cover" /> : null}
          </span>
          <span className="grid min-w-0 gap-1">
            <span className="truncate text-base font-semibold">{room.name}</span>
            <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
              <MusicIcon className="size-3 shrink-0" aria-hidden="true" />
              <span className="truncate">{sound ?? "No sound"}</span>
            </span>
            {scene ? <span className="truncate text-xs text-muted-foreground">{scene.label}</span> : null}
          </span>
        </span>
      </CardContent>
    </Card>
  )
}
