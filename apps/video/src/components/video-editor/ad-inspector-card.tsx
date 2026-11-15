import * as React from "react"

import { InspectorCard } from "@/components/broadcasts/inspector-fields"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  useEditorRuntime,
  type EditorClip,
} from "@/components/video-editor/editor-store"
import { getAdsErrorMessage, saveTextAdLook } from "@/lib/api/video/ads"
import { showErrorToast } from "@/lib/toast/error-toast"
import { changeAd, fitAdToLength, lookOfTextAd } from "@/lib/video/ads"
import type { AdMode } from "@/lib/video/timeline-schema"
import { editorId } from "@/lib/video/timeline-utils"

/**
 * The Ad card on top of the inspector when the clip picked is an ad
 * (`workspace/docs/ads.md`): whether the video pauses for it or keeps
 * running under it, fitting it to a length, and saving a text ad's look.
 */
export function AdInspectorCard({ clip }: { clip: EditorClip }) {
  const { store, dispatch } = useEditorRuntime()
  const [seconds, setSeconds] = React.useState("")
  const [lookName, setLookName] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  if (!clip.ad) return null
  const isText = clip.kind === "text"

  function change(patch: (current: EditorClip) => Partial<EditorClip>) {
    const result = changeAd(store.getSnapshot().state.tracks, clip.id, patch, editorId)
    if (!Array.isArray(result)) {
      showErrorToast(result.refusal)
      return
    }
    dispatch({ type: "EDIT_ADS", tracks: result, selectClipId: clip.id })
  }

  function setMode(mode: AdMode) {
    change((current) => ({ ad: { ...current.ad!, mode } }))
  }

  function fit() {
    const target = Number.parseFloat(seconds)
    if (!Number.isFinite(target) || target < 1 || target > 600) {
      showErrorToast("Type a length between 1 and 600 seconds.")
      return
    }
    change((current) => fitAdToLength(current, target * 1000))
    setSeconds("")
  }

  async function saveLook() {
    const name = lookName.trim()
    if (!name) {
      showErrorToast("Name the look first.")
      return
    }
    setSaving(true)
    try {
      await saveTextAdLook(name, lookOfTextAd(clip))
      setLookName("")
    } catch (error) {
      showErrorToast(getAdsErrorMessage(error, "The look could not be saved."))
    } finally {
      setSaving(false)
    }
  }

  return (
    <InspectorCard
      title="Ad"
      description={
        clip.ad.auto
          ? "Placed by Place ads. It moves to stay spread out when the video gets longer or shorter, until you drag it."
          : undefined
      }
    >
      {isText ? (
        <p className="text-xs text-muted-foreground">
          A text ad always sits over the video while it keeps playing.
        </p>
      ) : (
        <div className="grid gap-2">
          <Label id="ad-mode">At this ad</Label>
          <Tabs value={clip.ad.mode} onValueChange={(value) => setMode(value as AdMode)}>
            <TabsList aria-labelledby="ad-mode">
              <TabsTrigger value="pause">Your video pauses</TabsTrigger>
              <TabsTrigger value="over">Ad plays over it</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      )}
      <form
        className="grid gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          fit()
        }}
      >
        <Label htmlFor="ad-fit">Fit to a length, in seconds</Label>
        <div className="flex gap-2">
          <Input
            id="ad-fit"
            inputMode="decimal"
            className="w-24"
            value={seconds}
            placeholder={String(Math.round(clip.durationMs / 1000))}
            onChange={(event) => setSeconds(event.target.value)}
          />
          <Button type="submit" variant="outline">
            Fit
          </Button>
        </div>
        {isText ? null : (
          <p className="text-xs text-muted-foreground">
            Speeds it up a little, never past 1.2 times, then trims the end.
          </p>
        )}
      </form>
      {isText ? (
        <form
          className="grid gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            void saveLook()
          }}
        >
          <Label htmlFor="ad-look-name">Save this look</Label>
          <div className="flex gap-2">
            <Input
              id="ad-look-name"
              maxLength={60}
              className="min-w-0 flex-1"
              value={lookName}
              placeholder="Yellow box"
              onChange={(event) => setLookName(event.target.value)}
            />
            <Button type="submit" variant="outline" disabled={saving}>
              Save
            </Button>
          </div>
        </form>
      ) : null}
      <Button
        type="button"
        variant="outline"
        onClick={() => dispatch({ type: "DELETE_CLIP", clipId: clip.id })}
      >
        Take this ad off
      </Button>
    </InspectorCard>
  )
}
