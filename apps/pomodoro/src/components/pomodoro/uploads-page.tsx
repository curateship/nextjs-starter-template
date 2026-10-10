import * as React from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import { PlusIcon } from "lucide-react"
import { toast } from "sonner"

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
import { UploadBinView } from "@/components/pomodoro/upload-bin-view"
import type { UploadView } from "@/lib/api/pomodoro/media-uploads"
import {
  confirmPomodoroPurchase,
  getPurchaseErrorMessage,
} from "@/lib/api/pomodoro/purchases"
import { purchasedMessage } from "@/lib/pomodoro/purchases"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * My uploads: a member's own backgrounds and sounds, and the AI generator for
 * each, on one page with a tab per kind. Tyler, 10 Oct 2026: "The upload your
 * own and ai generated needs its own page. Link to it from the avatar
 * dropdown", with a "+ Add" beside Shuffle on Backgrounds and Sounds, and both
 * cards gone from those pages. `?kind=sound` opens the Sounds tab and
 * `?kind=bin` the 30-day bin (task 02). See `workspace/docs/my-uploads.md`.
 */
export function UploadsPage({
  kind,
  seedPrompt = "",
  purchaseSession = "",
}: {
  kind: UploadView
  /** Words for this tab's generator, from "Make a matching …" (task 06). */
  seedPrompt?: string
  /** Stripe's session id, on the way back from buying more (task 07). */
  purchaseSession?: string
}) {
  const navigate = useNavigate()
  const refreshToken = usePurchaseReturn(kind, purchaseSession)
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
              search: { kind: value as UploadView },
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
            <TabsTrigger value="bin" className={pillTabsTrigger}>
              Bin
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </header>
      {kind === "bin" ? (
        <UploadBinView />
      ) : kind === "sound" ? (
        <SoundUploads key={refreshToken} seedPrompt={seedPrompt} />
      ) : (
        <BackgroundUploads key={refreshToken} seedPrompt={seedPrompt} />
      )}
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

/**
 * Back from Stripe after buying a pack or space (task 07): ask the server to
 * confirm that session, say what it bought, take the session out of the
 * address, and redraw the tab so its counts include the purchase. Returns a
 * number that changes when the tab should redraw.
 */
function usePurchaseReturn(kind: UploadView, sessionId: string) {
  const navigate = useNavigate()
  const [token, setToken] = React.useState(0)
  const asked = React.useRef("")
  React.useEffect(() => {
    if (!sessionId || asked.current === sessionId) return
    asked.current = sessionId
    void confirmPomodoroPurchase(sessionId)
      .then((result) => {
        if (result.status === "paid") toast.success(purchasedMessage(result.product))
        else if (result.status === "pending")
          toast("Stripe is still confirming your payment. It appears here within a minute.")
        setToken((current) => current + 1)
      })
      .catch((error: unknown) => showErrorToast(getPurchaseErrorMessage(error)))
      .finally(() => {
        void navigate({ to: "/uploads", search: { kind }, replace: true })
      })
  }, [kind, navigate, sessionId])
  return token
}

/**
 * Arriving with words for the generator: scroll to it with the cursor in the
 * box, then take the words out of the address, so a reload or a shared link
 * does not fill the box again. The box keeps them; it read them when it
 * mounted.
 */
function useSeededGenerator(
  kind: PomodoroUploadPurpose,
  seedPrompt: string,
  goToGenerator: () => void
) {
  const navigate = useNavigate()
  React.useEffect(() => {
    if (!seedPrompt) return
    goToGenerator()
    void navigate({ to: "/uploads", search: { kind }, replace: true })
  }, [goToGenerator, kind, navigate, seedPrompt])
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

function BackgroundUploads({ seedPrompt }: { seedPrompt: string }) {
  const media = useRoomMedia()
  const { reloadToken, reloadUploads } = useUploadsReload()
  const { generatorRef, goToGenerator } = useGeneratorJump()
  useSeededGenerator("background", seedPrompt, goToGenerator)
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
              // A shared file can go in a room you host (rooms task 04).
              allowRoom: upload.shareState === "on",
            }}
          />
        )}
        renderThumbnail={(upload, playing) =>
          // A clip shows its middle frame and loads the film only while it
          // plays, so a grid of clips loads pictures (task 02, part 4).
          upload.kind === "video" && !playing && upload.stillUrl ? (
            <img src={upload.stillUrl} alt="" className="size-full object-cover" />
          ) : upload.kind === "video" ? (
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
        <MediaGeneratorSection
          kind="background"
          onFinished={reloadUploads}
          seedPrompt={seedPrompt}
        />
      </div>
    </>
  )
}

function SoundUploads({ seedPrompt }: { seedPrompt: string }) {
  const media = useRoomMedia()
  const preview = usePreviewAudio()
  const { reloadToken, reloadUploads } = useUploadsReload()
  const { generatorRef, goToGenerator } = useGeneratorJump()
  useSeededGenerator("sound", seedPrompt, goToGenerator)

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
              allowRoom: upload.shareState === "on",
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
        <MediaGeneratorSection
          kind="soundscape"
          onFinished={reloadUploads}
          seedPrompt={seedPrompt}
        />
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
