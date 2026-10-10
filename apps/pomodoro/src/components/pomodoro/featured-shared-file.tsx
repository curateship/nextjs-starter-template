import * as React from "react"
import { PauseIcon, PlayIcon } from "lucide-react"

import { readFeaturedSharedMedia } from "@/lib/api/pomodoro/shared-media"
import {
  sharedFilePath,
  sharedSound,
  type SharedMediaItem,
} from "@/lib/pomodoro/shared-media"
import { usePreviewAudio } from "@/lib/pomodoro/use-preview-audio"
import { PanelCard } from "@/components/pomodoro/panel-card"
import { CreditLink } from "@/components/pomodoro/shared-media-card"
import { SoundWave } from "@/components/pomodoro/sound-wave"

/**
 * The shared file an admin featured, under the timer on the front page for a
 * visitor who is not signed in (uploads-and-sharing task 05, part 8): a
 * small card with play and the credit. Nothing is drawn when none is
 * featured, or the featured file stops being shared.
 */
export function FeaturedSharedFile() {
  const [file, setFile] = React.useState<SharedMediaItem | null>(null)
  React.useEffect(() => {
    let cancelled = false
    void readFeaturedSharedMedia()
      .then((featured) => {
        if (!cancelled) setFile(featured)
      })
      // The most public page there is: a pick that cannot be read is left
      // off rather than shown as an error.
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])
  if (!file) return null
  return <FeaturedCard file={file} />
}

function FeaturedCard({ file }: { file: SharedMediaItem }) {
  const preview = usePreviewAudio()
  const [playingFilm, setPlayingFilm] = React.useState(false)
  const sound = file.purpose === "sound"
  const playing = sound ? preview.playing : playingFilm
  return (
    <PanelCard label={sound ? "Featured sound" : "Featured background"} className="w-full">
      <div className="flex items-center gap-4">
        <button
          type="button"
          className="relative aspect-video w-32 shrink-0 overflow-hidden rounded-xl bg-muted outline-none focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-solid"
          aria-pressed={playing}
          aria-label={playing ? `Stop ${file.name}` : `Play ${file.name}`}
          onClick={() =>
            sound ? preview.toggle(sharedSound(file)) : setPlayingFilm((on) => !on)
          }
        >
          {sound ? (
            <SoundWave seed={file.mediaId} playing={playing} />
          ) : file.kind === "video" && playingFilm ? (
            <video src={file.url} className="size-full object-cover" muted loop autoPlay playsInline />
          ) : (
            <img
              src={file.kind === "video" ? file.stillUrl || file.url : file.url}
              alt=""
              className="size-full object-cover"
            />
          )}
          <span className="absolute inset-0 grid place-items-center">
            <span className="grid size-9 place-items-center rounded-full bg-black/45 text-white backdrop-blur-sm">
              {playing ? (
                <PauseIcon className="size-4" aria-hidden="true" />
              ) : (
                <PlayIcon className="size-4" aria-hidden="true" />
              )}
            </span>
          </span>
        </button>
        <div className="flex min-w-0 flex-col gap-1">
          {file.credit.handle ? (
            <a
              href={sharedFilePath(file.credit.handle, file.mediaId)}
              className="truncate font-semibold underline-offset-2 hover:underline"
            >
              {file.name}
            </a>
          ) : (
            <strong className="truncate font-semibold">{file.name}</strong>
          )}
          <CreditLink credit={file.credit} className="text-sm text-muted-foreground" />
        </div>
      </div>
    </PanelCard>
  )
}
