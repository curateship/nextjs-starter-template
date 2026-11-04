import * as React from "react"
import { Loader2Icon, ScanFaceIcon, TargetIcon, XIcon } from "lucide-react"
import { toast } from "sonner"

import { InspectorCard } from "@/components/broadcasts/inspector-fields"
import { Button } from "@/components/ui/button"
import { useEditorRuntime, type EditorClip } from "@/components/video-editor/editor-store"
import { useProjectGuest } from "@/components/video-editor/project-guest"
import {
  findBlurFaces,
  followBlur,
  getBlurFollowErrorMessage,
} from "@/lib/api/video/blur-follow"
import {
  blurBoxAt,
  blurFollowMoments,
  type ShareBox,
} from "@/lib/video/blur"
import {
  blurFollowCostCents,
  findFacesCostCents,
  withEstimate,
} from "@/lib/video/ai-estimates"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import {
  clearFaceChoicesFor,
  onFacePicked,
  setFaceChoices,
  useBlurFaceChoices,
} from "@/components/video-editor/blur-face-choices"

/**
 * A face box made a little bigger, so the blur covers the hair and the chin
 * the model's tight box leaves out.
 */
function padded(face: ShareBox): ShareBox {
  const growX = face.width * 0.15
  const growY = face.height * 0.15
  const left = Math.max(0, face.left - growX)
  const top = Math.max(0, face.top - growY)
  return {
    left,
    top,
    width: Math.min(1, face.left + face.width + growX) - left,
    height: Math.min(1, face.top + face.height + growY) - top,
  }
}

/**
 * The Follow card on a blur (blur.md): follow what is under the blur now,
 * or find the faces on its first frame and follow the one picked on the
 * preview. Both use AI, so a guest sent from Project doesn't get the card.
 */
export function BlurFollowCard({ clip }: { clip: EditorClip }) {
  const guest = useProjectGuest()
  const { dispatch, videoId, saveNow, store, clock } = useEditorRuntime()
  const [busy, setBusy] = React.useState<"follow" | "faces" | null>(null)
  const choices = useBlurFaceChoices()
  const showingFaces = choices?.clipId === clip.id ? choices.faces : null
  const following = (clip.blurTrack?.length ?? 0) > 1

  // A blur that is no longer picked takes its numbered faces with it.
  React.useEffect(() => () => clearFaceChoicesFor(clip.id), [clip.id])

  const savedFirst = React.useCallback(async () => {
    await saveNow()
    if (store.getSnapshot().saveStatus === "error") {
      showErrorToast("The latest edits are not saved, so the blur can't follow yet.")
      return false
    }
    return true
  }, [saveNow, store])

  const follow = React.useCallback(
    async (box: ShareBox) => {
      setBusy("follow")
      try {
        if (!(await savedFirst())) return
        const track = await followBlur(videoId, clip.id, box)
        dismissErrorToast()
        if (track.length < 2) {
          showErrorToast("Couldn't find it again in the later frames, so the blur stays put.")
          return
        }
        dispatch({
          type: "UPDATE_CLIP",
          clipId: clip.id,
          patch: {
            x: box.left,
            y: box.top,
            toX: box.left + box.width,
            toY: box.top + box.height,
            blurTrack: track,
          },
        })
        toast.success("The blur now follows it.")
      } catch (error) {
        showErrorToast(getBlurFollowErrorMessage(error))
      } finally {
        setBusy(null)
      }
    },
    [clip.id, dispatch, savedFirst, videoId]
  )

  React.useEffect(
    () =>
      onFacePicked((clipId, face) => {
        if (clipId !== clip.id) return
        setFaceChoices(null)
        void follow(padded(face))
      }),
    [clip.id, follow]
  )

  async function findFaces() {
    setBusy("faces")
    try {
      if (!(await savedFirst())) return
      clock.pause()
      clock.seek(clip.startMs)
      const faces = await findBlurFaces(videoId, clip.id)
      dismissErrorToast()
      if (!faces.length) {
        showErrorToast("No faces on the blur's first frame.")
        return
      }
      setFaceChoices({ clipId: clip.id, faces })
    } catch (error) {
      showErrorToast(getBlurFollowErrorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  if (guest) return null

  const frames = blurFollowMoments(clip.durationMs).length
  return (
    <InspectorCard
      title="Follow"
      description={
        showingFaces
          ? "Click a numbered face on the preview to follow it."
          : following
            ? `Follows it through ${clip.blurTrack!.length} places, one every half second.`
            : "Keeps the blur on something that moves."
      }
    >
      <div className="grid gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={busy !== null}
          onClick={() => void follow(blurBoxAt({ ...clip, blurTrack: undefined }, 0))}
        >
          {busy === "follow" ? <Loader2Icon className="animate-spin" /> : <TargetIcon />}
          {withEstimate(following ? "Follow again" : "Follow what's under it", blurFollowCostCents(frames))}
        </Button>
        {showingFaces ? (
          <Button type="button" variant="ghost" onClick={() => setFaceChoices(null)}>
            <XIcon />
            Don't pick a face
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            disabled={busy !== null}
            onClick={() => void findFaces()}
          >
            {busy === "faces" ? <Loader2Icon className="animate-spin" /> : <ScanFaceIcon />}
            {withEstimate("Find faces", findFacesCostCents())}
          </Button>
        )}
        {following ? (
          <Button
            type="button"
            variant="ghost"
            disabled={busy !== null}
            onClick={() =>
              dispatch({ type: "UPDATE_CLIP", clipId: clip.id, patch: { blurTrack: undefined } })
            }
          >
            <XIcon />
            Stop following
          </Button>
        ) : null}
      </div>
    </InspectorCard>
  )
}
