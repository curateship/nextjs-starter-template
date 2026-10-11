import * as React from "react"
import { BookmarkPlusIcon, FlagIcon, Loader2Icon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  getSharedMediaErrorMessage,
  setSharedMediaSaved,
} from "@/lib/api/pomodoro/shared-media"
import { useProductAuth } from "@/lib/pomodoro/auth-state"
import type { BackgroundReference } from "@/lib/pomodoro/background-catalog"
import {
  addBackgroundToPersonalRoom,
  addSoundToPersonalRoom,
  useRoomMedia,
} from "@/lib/pomodoro/room-media-store"
import type { MediaCredit } from "@/lib/pomodoro/shared-media"
import type { SoundReference } from "@/lib/pomodoro/sound-catalog"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { ReportSharedFileDialog } from "@/components/pomodoro/report-shared-file-dialog"
import { CreditLink } from "@/components/pomodoro/shared-media-card"

type Credited =
  | { kind: "sound"; reference: Extract<SoundReference, { type: "media" }>; credit: MediaCredit }
  | {
      kind: "background"
      reference: Extract<BackgroundReference, { type: "media" }>
      credit: MediaCredit
    }

/**
 * Who made the sound and background playing now, when either is someone
 * else's shared file (task 03, part 4): "Sound by @sarah · Background by a
 * member", under the player beneath the clock, at home and in a room. Your
 * own files and catalogue items carry no credit, so the line is not drawn.
 *
 * In somebody's hosted room each credit also offers "Add this to mine"
 * (rooms task 04, part 2), which saves the file and offers to use it in your
 * own room, and Report.
 */
export function MediaCreditLine() {
  const { sound, background, room } = useRoomMedia()
  const credited: Credited[] = []
  if (sound?.type === "media" && sound.credit)
    credited.push({ kind: "sound", reference: sound, credit: sound.credit })
  if (background.type === "media" && background.credit)
    credited.push({
      kind: "background",
      reference: background,
      credit: background.credit,
    })
  if (!credited.length) return null

  return (
    <div className="flex basis-full flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      {credited.map((item) => (
        <span key={item.kind} className="flex items-center gap-1">
          {item.kind === "sound" ? "Sound" : "Background"}{" "}
          <CreditLink credit={item.credit} className="text-foreground" />
          {room ? <RoomCreditActions item={item} /> : null}
        </span>
      ))}
    </div>
  )
}

/** "Add this to mine" and Report, beside a credit inside a hosted room. */
function RoomCreditActions({ item }: { item: Credited }) {
  const { authenticated } = useProductAuth()
  const [busy, setBusy] = React.useState(false)
  const [reporting, setReporting] = React.useState(false)
  const name =
    item.kind === "sound"
      ? (item.reference.label ?? "This sound")
      : "This background"

  const playItNow = async () => {
    dismissErrorToast()
    try {
      if (item.kind === "sound") await addSoundToPersonalRoom(item.reference)
      else await addBackgroundToPersonalRoom(item.reference)
      toast.success(`${name} is in your personal room. You get it when you leave this room.`)
    } catch (cause) {
      showErrorToast(getSharedMediaErrorMessage(cause))
    }
  }

  const addToMine = async () => {
    dismissErrorToast()
    setBusy(true)
    try {
      await setSharedMediaSaved(item.reference.mediaId, true)
      toast.success(`${name} is in your Saved list.`, {
        action: { label: "Use it now", onClick: () => void playItNow() },
      })
    } catch (cause) {
      showErrorToast(getSharedMediaErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {authenticated ? (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          disabled={busy}
          onClick={() => void addToMine()}
        >
          {busy ? (
            <Loader2Icon className="animate-spin" aria-hidden="true" />
          ) : (
            <BookmarkPlusIcon aria-hidden="true" />
          )}
          Add this to mine
        </Button>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={`Report the ${item.kind}`}
        title="Report"
        onClick={() => setReporting(true)}
      >
        <FlagIcon aria-hidden="true" />
      </Button>
      <ReportSharedFileDialog
        open={reporting}
        onOpenChange={setReporting}
        mediaId={item.reference.mediaId}
        name={name}
      />
    </>
  )
}
