import * as React from "react"
import { Link } from "@tanstack/react-router"
import { FlagIcon, HeartIcon, Loader2Icon, PauseIcon, PlayIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  getSharedMediaErrorMessage,
  setSharedMediaSaved,
} from "@/lib/api/pomodoro/shared-media"
import { useProductAuth } from "@/lib/pomodoro/auth-state"
import { contentColumn } from "@/lib/pomodoro/content-column"
import {
  sharedBackground,
  sharedFilePath,
  sharedSound,
  type SharedMediaItem,
} from "@/lib/pomodoro/shared-media"
import { usePreviewAudio } from "@/lib/pomodoro/use-preview-audio"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"
import { MediaAddActions } from "@/components/pomodoro/media-add-actions"
import { ReportSharedFileDialog } from "@/components/pomodoro/report-shared-file-dialog"
import { SoundWave } from "@/components/pomodoro/sound-wave"

export type SharedFilePageData = {
  file: SharedMediaItem
  owner: { handle: string; name: string; avatarUrl: string | null }
}

/**
 * One shared file's own page, `/u/<handle>/files/<id>` (task 03, part 7):
 * a preview, who shared it, Add, Save, Share to X and Report.
 */
export function SharedFilePage({ data }: { data: SharedFilePageData }) {
  const { file, owner } = data
  const sound = file.purpose === "sound"
  const kindWord = sound ? "sound" : "background"
  const [reporting, setReporting] = React.useState(false)

  return (
    <div className={`${contentColumn} flex flex-col gap-6 py-8`}>
      <header className="title-halo flex flex-col gap-2">
        <h2 className="text-4xl font-bold tracking-tight break-words">
          {file.name}
        </h2>
        <p className="text-muted-foreground">
          A {kindWord} shared by{" "}
          <Link
            to="/u/$handle"
            params={{ handle: owner.handle }}
            className="font-semibold text-foreground underline-offset-2 hover:underline"
          >
            {owner.name}
          </Link>{" "}
          (@{owner.handle})
          {file.usedBy !== null ? ` · Used by ${file.usedBy} people` : ""}
        </p>
      </header>

      <Card className="gap-0 overflow-hidden p-0">
        {sound ? <SoundPreview file={file} /> : <PicturePreview file={file} />}
        <CardContent className="flex flex-col gap-4 py-4">
          {file.tags.length ? (
            <p className="flex flex-wrap gap-2 font-mono text-[11px] uppercase tracking-[0.15em] text-[var(--p-accent-2)]">
              {file.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <MediaAddActions
              item={
                sound
                  ? { kind: "sound", reference: sharedSound(file), label: file.name }
                  : {
                      kind: "background",
                      reference: sharedBackground(file),
                      label: file.name,
                    }
              }
            />
            {file.own ? null : <SaveButton file={file} />}
            <Button
              variant="outline"
              size="sm"
              // Worked out on the click, because the full address needs the
              // browser's own site and the server does not know it.
              onClick={() =>
                window.open(shareOnXHref(file, owner.handle), "_blank", "noopener,noreferrer")
              }
            >
              Share to X
            </Button>
            {file.own ? null : (
              <Button variant="ghost" size="sm" onClick={() => setReporting(true)}>
                <FlagIcon aria-hidden="true" />
                Report
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
      <ReportSharedFileDialog
        open={reporting}
        onOpenChange={setReporting}
        mediaId={file.mediaId}
        name={file.name}
      />
    </div>
  )
}

function SoundPreview({ file }: { file: SharedMediaItem }) {
  const preview = usePreviewAudio()
  const reference = sharedSound(file)
  const playing = preview.playing && preview.previewing?.type === "media"
  return (
    <button
      type="button"
      className="group relative block aspect-[8/3] w-full outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
      aria-pressed={playing}
      aria-label={playing ? `Stop ${file.name}` : `Play ${file.name}`}
      onClick={() => preview.toggle(reference)}
    >
      <SoundWave seed={file.mediaId} playing={playing} />
      <span className="absolute inset-0 grid place-items-center">
        <span className="grid size-14 place-items-center rounded-full bg-black/45 text-white backdrop-blur-sm">
          {playing ? (
            <PauseIcon className="size-6" aria-hidden="true" />
          ) : (
            <PlayIcon className="size-6" aria-hidden="true" />
          )}
        </span>
      </span>
      {preview.failed ? (
        <span role="status" className="absolute bottom-3 left-3 text-sm text-white">
          That sound could not be played. Press it to try again.
        </span>
      ) : null}
    </button>
  )
}

function PicturePreview({ file }: { file: SharedMediaItem }) {
  return (
    <div className="relative aspect-video w-full bg-muted">
      {file.kind === "video" ? (
        <video
          src={file.url}
          poster={file.stillUrl || undefined}
          className="size-full object-cover"
          muted
          loop
          autoPlay
          playsInline
          // A background is scenery: no sound, and nothing to scrub.
          aria-label={file.name}
        />
      ) : (
        <img src={file.url} alt={file.name} className="size-full object-cover" />
      )}
    </div>
  )
}

function SaveButton({ file }: { file: SharedMediaItem }) {
  const { authenticated } = useProductAuth()
  const [saved, setSaved] = React.useState(file.saved)
  const [busy, setBusy] = React.useState(false)
  if (!authenticated) return null
  const toggle = async () => {
    const next = !saved
    setBusy(true)
    setSaved(next)
    try {
      await setSharedMediaSaved(file.mediaId, next)
    } catch (cause) {
      setSaved(!next)
      showErrorToast(getSharedMediaErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Button
      variant="outline"
      size="sm"
      aria-pressed={saved}
      disabled={busy}
      onClick={() => void toggle()}
    >
      {busy ? (
        <Loader2Icon className="animate-spin" aria-hidden="true" />
      ) : (
        <HeartIcon
          className={cn(saved && "fill-current text-[var(--p-accent)]")}
          aria-hidden="true"
        />
      )}
      {saved ? "Saved" : "Save"}
    </Button>
  )
}

/** An X post with the file's name and its page, which unfurls into its picture. */
function shareOnXHref(file: SharedMediaItem, handle: string) {
  const address = new URL(
    sharedFilePath(handle, file.mediaId),
    window.location.origin
  ).toString()
  const text = `${file.name}, a ${file.purpose === "sound" ? "focus sound" : "focus background"} on Pomoder`
  return `https://x.com/intent/post?${new URLSearchParams({ text, url: address })}`
}
