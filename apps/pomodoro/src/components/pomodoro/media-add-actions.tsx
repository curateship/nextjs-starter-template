import * as React from "react"
import { CheckIcon, Loader2Icon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { saveHostedRoomMedia } from "@/lib/api/pomodoro/rooms"
import { useProductAuth } from "@/lib/pomodoro/auth-state"
import {
  sameBackgroundReference,
  serializeBackgroundReference,
  type BackgroundReference,
} from "@/lib/pomodoro/background-catalog"
import { PRO_PERKS } from "@/lib/pomodoro/pro"
import {
  addBackgroundToPersonalRoom,
  addSoundToPersonalRoom,
  enterHostedRoom,
  useRoomMedia,
} from "@/lib/pomodoro/room-media-store"
import {
  sameSoundReference,
  serializeSoundReference,
  type SoundReference,
} from "@/lib/pomodoro/sound-catalog"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

type Item =
  | { kind: "sound"; reference: SoundReference; label: string }
  | { kind: "background"; reference: BackgroundReference; label: string }

/**
 * The buttons under a previewed sound or theme. See
 * `workspace/docs/personal-room.md`.
 *
 * - "Add to my personal room" saves it to your own room.
 * - "Add to this room" is for the host of the room you are in, and changes it
 *   for everybody in it. A hosted room takes catalogue items only, so an
 *   upload never offers it.
 * - A guest has no room of their own, so the one button keeps it for this
 *   visit.
 * - A member of somebody else's room gets nothing here: the host picked the
 *   room's pair, and the page says so at the top (`MediaRoomNote`).
 */
export function MediaAddActions({
  item,
  onPicture = false,
}: {
  item: Item
  /**
   * Drawn over a card's picture (Sounds): the "in your room" labels get a
   * dark glass pill, so they read on a bright picture as well as a dark one.
   */
  onPicture?: boolean
}) {
  const { authenticated } = useProductAuth()
  const media = useRoomMedia()
  const [busy, setBusy] = React.useState<"" | "personal" | "room">("")
  const room = media.room
  if (room && room.role !== "host") return null

  const inPersonal =
    item.kind === "sound"
      ? sameSoundReference(media.personalSound, item.reference)
      : sameBackgroundReference(media.personalBackground, item.reference)
  const inRoom = room
    ? item.kind === "sound"
      ? sameSoundReference(room.sound, item.reference)
      : sameBackgroundReference(room.background, item.reference)
    : false
  const catalogue =
    item.kind === "sound"
      ? item.reference.type === "curated"
      : item.reference.type === "scene"

  const refusal = (cause: unknown) => {
    const text = cause instanceof Error ? cause.message : ""
    return text.includes("UPGRADE_REQUIRED")
      ? PRO_PERKS.premiumMedia.lockedReason
      : text.includes("ROOM_HOST_REQUIRED")
        ? "Only the host can change this room."
        : text.includes("ROOM_CLOSED")
          ? "That room has ended."
          : `${item.label} could not be added. Try again.`
  }

  const addToPersonal = async () => {
    dismissErrorToast()
    setBusy("personal")
    try {
      if (item.kind === "sound") await addSoundToPersonalRoom(item.reference)
      else await addBackgroundToPersonalRoom(item.reference)
      toast.success(
        authenticated
          ? room
            ? `${item.label} is in your personal room. You get it when you leave ${room.name}.`
            : `${item.label} is in your personal room.`
          : `${item.label} is on for this visit.`
      )
    } catch (cause) {
      showErrorToast(refusal(cause))
    } finally {
      setBusy("")
    }
  }

  const addToRoom = async () => {
    if (!room) return
    dismissErrorToast()
    setBusy("room")
    try {
      const sound =
        item.kind === "sound"
          ? serializeSoundReference(item.reference)
          : serializeSoundReference(room.sound)
      const background =
        item.kind === "background"
          ? serializeBackgroundReference(item.reference)
          : serializeBackgroundReference(room.background)
      // A room made before rooms had a pair has no sound yet; picking a
      // theme for it waits until a sound is picked too.
      if (!sound || !background) {
        showErrorToast("Pick a sound for this room first, then a theme.")
        return
      }
      const snapshot = await saveHostedRoomMedia(room.slug, { sound, background })
      enterHostedRoom({
        slug: snapshot.room.slug,
        name: snapshot.room.name,
        role: snapshot.you.role,
        sound: snapshot.room.sound,
        background: snapshot.room.background,
      })
      toast.success(`${item.label} is on in ${room.name} for everyone in it.`)
    } catch (cause) {
      showErrorToast(refusal(cause))
    } finally {
      setBusy("")
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {inPersonal ? (
        <InUse onPicture={onPicture}>
          {authenticated ? "In your personal room" : "On for this visit"}
        </InUse>
      ) : (
        <Button
          size="sm"
          disabled={busy !== ""}
          onClick={() => void addToPersonal()}
        >
          {busy === "personal" ? (
            <Loader2Icon className="animate-spin" aria-hidden="true" />
          ) : null}
          {authenticated ? "Add to my personal room" : "Use for this visit"}
        </Button>
      )}
      {room && catalogue ? (
        inRoom ? (
          <InUse onPicture={onPicture}>In {room.name}</InUse>
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled={busy !== ""}
            onClick={() => void addToRoom()}
          >
            {busy === "room" ? (
              <Loader2Icon className="animate-spin" aria-hidden="true" />
            ) : null}
            Add to this room
          </Button>
        )
      ) : null}
    </div>
  )
}

/**
 * The label on the card in use in the room you are in. Tyler, 7 Oct 2026:
 * "Add a label that says Currently selected." It sits over the card's picture,
 * so it reads the same on Sounds, Backgrounds and your own uploads.
 */
export function CurrentlySelectedLabel() {
  return (
    <span className="absolute top-2 left-2 z-[1] flex items-center gap-1 rounded-full bg-[var(--p-accent)] px-2 py-0.5 text-[11px] font-semibold text-[var(--p-on-accent)]">
      <CheckIcon className="size-3" aria-hidden="true" />
      Currently selected
    </span>
  )
}

function InUse({
  onPicture,
  children,
}: {
  onPicture: boolean
  children: React.ReactNode
}) {
  return (
    <span
      className={cn(
        "flex h-7 items-center gap-1 text-xs",
        onPicture
          ? "rounded-full bg-black/55 px-2.5 text-white backdrop-blur-sm"
          : "text-muted-foreground"
      )}
    >
      <CheckIcon className="size-3.5" aria-hidden="true" />
      {children}
    </span>
  )
}

/**
 * The line at the top of Sounds and Backgrounds that says whose room a pick
 * goes to. A member of somebody else's room is told the host picked it.
 */
export function MediaRoomNote({ thing }: { thing: "sound" | "theme" }) {
  const { room } = useRoomMedia()
  const { authenticated } = useProductAuth()
  const text = room
    ? room.role === "host"
      ? `You are hosting ${room.name}. Click a ${thing} to hear it first. "Add to this room" changes it for everyone in the room.`
      : `The host picked this room's sound and theme. You can still preview here, and your own room comes back when you leave ${room.name}.`
    : authenticated
      ? `Click a ${thing} to try it. Nothing changes until you add it to your personal room.`
      : `Click a ${thing} to try it. Sign in to keep one in a personal room of your own.`
  return <p className="max-w-xl text-muted-foreground">{text}</p>
}
