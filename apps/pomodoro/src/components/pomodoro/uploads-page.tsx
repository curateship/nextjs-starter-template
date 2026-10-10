import * as React from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import { PlusIcon } from "lucide-react"

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import {
  sameBackgroundReference,
  type BackgroundReference,
} from "@/lib/pomodoro/background-catalog"
import { sameSoundReference } from "@/lib/pomodoro/sound-catalog"
import { useRoomMedia } from "@/lib/pomodoro/room-media-store"
import { usePreviewAudio } from "@/lib/pomodoro/use-preview-audio"
import { useGeneratorJump } from "@/lib/pomodoro/use-generator-jump"
import { contentColumn } from "@/lib/pomodoro/content-column"
import { pillTabsList, pillTabsTrigger } from "@/lib/pomodoro/pill-tabs"

import type { PomodoroUploadPurpose } from "@/lib/pomodoro/media-limits"
import { MediaAddMenu } from "@/components/pomodoro/media-add-actions"
import { SoundWave } from "@/components/pomodoro/sound-wave"
import { MediaUploadsSection } from "@/components/pomodoro/media-uploads-section"
import { MediaGeneratorSection } from "@/components/pomodoro/media-generator-section"

/**
 * My uploads: a member's own backgrounds and sounds, and the AI generator for
 * each, on one page with a tab per kind. Tyler, 10 Oct 2026: "The upload your
 * own and ai generated needs its own page. Link to it from the avatar
 * dropdown", with a "+ Add" beside Shuffle on Backgrounds and Sounds, and both
 * cards gone from those pages. `?kind=sound` opens the Sounds tab. See
 * `workspace/docs/own-media-uploads.md`.
 */
export function UploadsPage({ kind }: { kind: PomodoroUploadPurpose }) {
  const navigate = useNavigate()
  return (
    <div className={`${contentColumn} flex flex-col gap-6 py-8`}>
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="title-halo flex flex-col gap-2">
          <h2 className="text-4xl font-bold tracking-tight">My uploads</h2>
          <p className="text-muted-foreground">
            Your own backgrounds and sounds, uploaded or made with AI. Press +
            on one to add it to your personal room.
          </p>
        </div>
        <Tabs
          value={kind}
          onValueChange={(value) =>
            void navigate({
              to: "/uploads",
              search: { kind: value as PomodoroUploadPurpose },
              replace: true,
            })
          }
        >
          <TabsList aria-label="Kind of file" className={pillTabsList}>
            <TabsTrigger value="background" className={pillTabsTrigger}>
              Backgrounds
            </TabsTrigger>
            <TabsTrigger value="sound" className={pillTabsTrigger}>
              Sounds
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </header>
      {kind === "sound" ? <SoundUploads /> : <BackgroundUploads />}
    </div>
  )
}

/**
 * The "+ Add" beside Shuffle on Backgrounds and Sounds, in the same round
 * tray, opening My uploads on that kind's tab.
 */
export function AddUploadsLink({ kind }: { kind: PomodoroUploadPurpose }) {
  return (
    <Link
      to="/uploads"
      search={{ kind }}
      aria-label={
        kind === "sound" ? "Add your own sounds" : "Add your own backgrounds"
      }
      className={cn(
        pillTabsList,
        "inline-flex items-center bg-muted/60 transition-colors hover:bg-muted"
      )}
    >
      <span
        className={cn(pillTabsTrigger, "inline-flex items-center gap-2 font-medium")}
      >
        <PlusIcon className="size-4" aria-hidden="true" />
        Add
      </span>
    </Link>
  )
}

/** An AI file arrives as an ordinary upload, so a finished one reloads the grid. */
function useUploadsReload() {
  const [reloadToken, setReloadToken] = React.useState(0)
  // Stable, so the generator's own fetch is not re-armed by an unrelated
  // re-render of this page.
  const reloadUploads = React.useCallback(
    () => setReloadToken((token) => token + 1),
    []
  )
  return { reloadToken, reloadUploads }
}

function BackgroundUploads() {
  const media = useRoomMedia()
  const { reloadToken, reloadUploads } = useUploadsReload()
  const { generatorRef, goToGenerator } = useGeneratorJump()
  const inUse = media.room?.background ?? media.personalBackground

  return (
    <>
      <MediaUploadsSection
        reloadToken={reloadToken}
        purpose="background"
        title="Your own"
        uploadLabel="Upload clip"
        onGenerate={goToGenerator}
        description="Hover over one to see it play, then press + to add it to your personal room."
        isSelected={(upload) =>
          sameBackgroundReference(inUse, {
            type: "media",
            mediaId: upload.mediaId,
          })
        }
        renderAddMenu={(upload) => (
          <MediaAddMenu
            item={{
              kind: "background",
              reference: uploadReference(upload),
              label: upload.name,
            }}
          />
        )}
        renderThumbnail={(upload, playing) =>
          upload.kind === "video" ? (
            <video
              // Rebuilt when it starts or stops, because a playing video
              // does not stop just because `autoPlay` turned false.
              key={playing ? "playing" : "still"}
              // `#t=0.1` asks the browser for a tenth of a second in, which
              // is what makes it paint a real frame. Without it the card is
              // a grey box until somebody presses play.
              src={playing ? upload.url : `${upload.url}#t=0.1`}
              className="size-full object-cover"
              muted
              loop
              autoPlay={playing}
              playsInline
              preload="metadata"
            />
          ) : (
            <img src={upload.url} alt="" className="size-full object-cover" />
          )
        }
      />
      <div ref={generatorRef} className="scroll-mt-6">
        <MediaGeneratorSection kind="background" onFinished={reloadUploads} />
      </div>
    </>
  )
}

function SoundUploads() {
  const media = useRoomMedia()
  const preview = usePreviewAudio()
  const { reloadToken, reloadUploads } = useUploadsReload()
  const { generatorRef, goToGenerator } = useGeneratorJump()

  return (
    <>
      {preview.failed ? (
        <p role="status" className="text-sm text-muted-foreground">
          That preview could not be played. Click the card to try again.
        </p>
      ) : null}
      <MediaUploadsSection
        reloadToken={reloadToken}
        purpose="sound"
        title="Your own"
        uploadLabel="Upload sound"
        onGenerate={goToGenerator}
        description="Press one to hear it, then press + to add it to your personal room."
        isSelected={(upload) =>
          sameSoundReference(media.sound, {
            type: "media",
            mediaId: upload.mediaId,
          })
        }
        onWindowOpen={preview.stop}
        isPlaying={(upload) =>
          preview.playing &&
          sameSoundReference(preview.previewing, {
            type: "media",
            mediaId: upload.mediaId,
          })
        }
        onPick={(upload) =>
          preview.toggle({
            type: "media",
            mediaId: upload.mediaId,
            mediaUrl: upload.url,
          })
        }
        renderAddMenu={(upload) => (
          <MediaAddMenu
            item={{
              kind: "sound",
              reference: {
                type: "media",
                mediaId: upload.mediaId,
                mediaUrl: upload.url,
              },
              label: upload.name,
            }}
          />
        )}
        // The same moving waveform as the catalogue's sounds, drawn from the
        // upload's id.
        renderThumbnail={(upload, playing) => (
          <SoundWave seed={upload.mediaId} playing={playing} />
        )}
      />
      <div ref={generatorRef} className="scroll-mt-6">
        <MediaGeneratorSection kind="soundscape" onFinished={reloadUploads} />
      </div>
    </>
  )
}

function uploadReference(upload: {
  mediaId: string
  kind: string
  url: string
}): BackgroundReference {
  return {
    type: "media",
    mediaId: upload.mediaId,
    mediaKind: upload.kind === "video" ? "video" : "image",
    mediaUrl: upload.url,
  }
}
