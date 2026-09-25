import * as React from "react"
import { Loader2Icon, ScissorsIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  findJumpCuts,
  getAiToolErrorMessage,
  type AiToolsAvailability,
} from "@/lib/api/video/ai-tools"
import { AiChoiceField } from "@/components/video-editor/ai-choice-field"
import { formatClock } from "@/lib/video/timeline-utils"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { plural } from "@/lib/format/plural"
import {
  DEFAULT_FILLER_TERMS,
  FILLER_WORD_OPTIONS,
} from "@/lib/video/filler-words"
import {
  JUMP_CUT_SENSITIVITIES,
  type JumpCutMode,
  type JumpCutSensitivity,
  type JumpCutSuggestion,
} from "@/lib/video/jump-cuts"
import {
  findClip,
  useEditorRuntime,
  useEditorSelector,
  type EditorClip,
  type EditorTrack,
} from "@/components/video-editor/editor-store"

/**
 * Tightening up a clip.
 *
 * It works on the clip you have picked, or the longest one with sound in it if
 * you have not picked anything — pressing a button should not need a step
 * beforehand. By default it just makes the cuts; ask to see them first and it
 * lists every one to be kept or dropped. Either way it is one action, so one
 * press of undo puts the clip back exactly as it was.
 */
export function JumpCutsDialog({
  open,
  onOpenChange,
  canUseWords,
  available,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Filler words need a transcript, which needs a key. */
  canUseWords: boolean
  available: AiToolsAvailability | null
}) {
  const { projectId, dispatch, saveNow } = useEditorRuntime()
  // The clip you picked, or the longest one with sound in it. Asking somebody
  // to select a clip before they can press a button is a step for nothing when
  // there is only ever one obvious answer.
  const clipId = useEditorSelector((state) => {
    if (state.selectedClipId) {
      const picked = findClip(state.tracks, state.selectedClipId)
      if (picked && hasSound(picked.clip)) return picked.clip.id
    }
    return longestClipWithSound(state.tracks)
  })
  const clipName = useEditorSelector((state) =>
    clipId ? (findClip(state.tracks, clipId)?.clip.name ?? null) : null
  )
  const [mode, setMode] = React.useState<JumpCutMode>("dead-air")
  const [sensitivity, setSensitivity] =
    React.useState<JumpCutSensitivity>("balanced")
  const [terms, setTerms] = React.useState<string[]>(DEFAULT_FILLER_TERMS)
  const [looking, setLooking] = React.useState(false)
  // "Just do it" makes the cuts as soon as it has found them; "Show me first"
  // lists them to be picked over.
  const [straightAway, setStraightAway] = React.useState(true)
  const [found, setFound] = React.useState<JumpCutSuggestion[] | null>(null)
  const [keep, setKeep] = React.useState<Set<string>>(new Set())

  // Opening starts fresh: last time's answers are about last time's clip.
  const [wasOpen, setWasOpen] = React.useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) {
      setFound(null)
      setKeep(new Set())
    }
  }

  const chosen = (found ?? []).filter((cut) => !keep.has(cut.id))

  async function look() {
    if (!clipId) return
    setLooking(true)
    try {
      // The server reads the saved timeline, so anything still waiting to be
      // sent goes first.
      await saveNow()
      const answer = await findJumpCuts({
        projectId,
        clipId,
        mode,
        sensitivity,
        fillerTerms: mode === "filler" ? terms : undefined,
      })
      dismissErrorToast()
      if (straightAway) {
        cut(answer.suggestions)
        return
      }
      setFound(answer.suggestions)
      setKeep(new Set())
      if (!answer.suggestions.length) {
        toast.success("Nothing in that clip is worth taking out.")
      }
    } catch (error) {
      showErrorToast(getAiToolErrorMessage(error))
    } finally {
      setLooking(false)
    }
  }

  function cut(cuts: JumpCutSuggestion[]) {
    if (!clipId) return
    if (!cuts.length) {
      toast.success("Nothing in that clip is worth taking out.")
      onOpenChange(false)
      return
    }
    const removedMs = cuts.reduce((total, one) => total + one.removedDurationMs, 0)
    dispatch({
      type: "APPLY_JUMP_CUTS",
      clipId,
      removals: cuts.map((one) => ({
        clipStartMs: one.clipStartMs,
        clipEndMs: one.clipEndMs,
      })),
      rippleClipIds: [],
    })
    toast.success(
      `${cuts.length} ${plural(cuts.length, "cut", "cuts")} made — ${formatSeconds(removedMs)} shorter. Undo puts it back.`
    )
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Tighten the clip</DialogTitle>
          <DialogDescription>
            {clipName
              ? `Working on “${clipName}”. Undo puts it back.`
              : "Nothing on this timeline has sound in it."}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Card size="sm">
            <CardHeader>
              <CardTitle>What to look for</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <Tabs
                value={mode}
                onValueChange={(next) => {
                  setMode(next as JumpCutMode)
                  setFound(null)
                }}
              >
                <TabsList>
                  <TabsTrigger value="dead-air">Dead air</TabsTrigger>
                  <TabsTrigger value="filler" disabled={!canUseWords}>
                    Filler words
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              {mode === "dead-air" ? (
                <div className="grid gap-2">
                  <Label>How keen to be</Label>
                  <Tabs
                    value={sensitivity}
                    onValueChange={(next) => {
                      setSensitivity(next as JumpCutSensitivity)
                      setFound(null)
                    }}
                  >
                    <TabsList>
                      {JUMP_CUT_SENSITIVITIES.map((option) => (
                        <TabsTrigger key={option.id} value={option.id}>
                          {option.label}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </Tabs>
                  <p className="text-sm text-muted-foreground">
                    {
                      JUMP_CUT_SENSITIVITIES.find(
                        (option) => option.id === sensitivity
                      )?.note
                    }
                    . Quiet bits are found by listening to the sound, so this
                    costs nothing.
                  </p>
                </div>
              ) : (
                <div className="grid gap-2">
                  <Label>Which words</Label>
                  <div className="flex flex-wrap gap-x-4 gap-y-2">
                    {FILLER_WORD_OPTIONS.map((option) => (
                      <label
                        key={option.term}
                        className="flex items-center gap-2 text-sm"
                      >
                        <Checkbox
                          checked={terms.includes(option.term)}
                          onCheckedChange={() => {
                            setTerms((current) =>
                              current.includes(option.term)
                                ? current.filter((term) => term !== option.term)
                                : [...current, option.term]
                            )
                            setFound(null)
                          }}
                          aria-label={option.label}
                        />
                        {option.label}
                      </label>
                    ))}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    This one has to listen to what was said, so it comes off
                    your AI budget.
                  </p>
                  <AiChoiceField kind="transcriber" available={available} />
                </div>
              )}
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle>How to do it</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs
                value={straightAway ? "now" : "review"}
                onValueChange={(next) => {
                  setStraightAway(next === "now")
                  setFound(null)
                }}
              >
                <TabsList>
                  <TabsTrigger value="now">Just do it</TabsTrigger>
                  <TabsTrigger value="review">Show me first</TabsTrigger>
                </TabsList>
              </Tabs>
            </CardContent>
          </Card>

          {found ? (
            <Card size="sm">
              <CardHeader>
                <CardTitle>
                  {found.length
                    ? `${found.length} ${plural(found.length, "cut", "cuts")} found`
                    : "Nothing to cut"}
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2">
                {found.length ? (
                  found.map((cut) => (
                    <label
                      key={cut.id}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <span className="flex items-center gap-2">
                        <Checkbox
                          checked={!keep.has(cut.id)}
                          onCheckedChange={() =>
                            setKeep((current) => {
                              const next = new Set(current)
                              if (next.has(cut.id)) next.delete(cut.id)
                              else next.add(cut.id)
                              return next
                            })
                          }
                          aria-label={`Cut ${cut.reason} at ${formatClock(cut.timelineStartMs)}`}
                        />
                        <span>{cut.reason}</span>
                      </span>
                      <span className="text-muted-foreground tabular-nums">
                        {formatClock(cut.timelineStartMs)} ·{" "}
                        {formatSeconds(cut.removedDurationMs)}
                      </span>
                    </label>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Nothing in this clip is worth taking out.
                  </p>
                )}
              </CardContent>
            </Card>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          {found?.length ? (
            <Button
              type="button"
              disabled={!chosen.length}
              onClick={() => cut(chosen)}
            >
              <ScissorsIcon />
              Make {chosen.length} {plural(chosen.length, "cut", "cuts")}
            </Button>
          ) : (
            <Button
              type="button"
              disabled={looking || !clipId}
              onClick={() => void look()}
            >
              {looking ? <Loader2Icon className="animate-spin" /> : null}
              {looking
                ? "Listening…"
                : straightAway
                  ? "Tighten it"
                  : "Look through it"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Only footage and sound can be listened to; a title has nothing to cut. */
function hasSound(clip: EditorClip) {
  return (clip.kind === "video" || clip.kind === "audio") && !!clip.mediaId
}

/** The obvious thing to work on when nothing has been picked. */
function longestClipWithSound(tracks: EditorTrack[]) {
  let best: EditorClip | null = null
  for (const track of tracks) {
    if (track.muted) continue
    for (const clip of track.clips ?? []) {
      if (!hasSound(clip)) continue
      if (!best || clip.durationMs > best.durationMs) best = clip
    }
  }
  return best?.id ?? null
}

/** "1.2s" — short enough to sit at the end of a row. */
function formatSeconds(ms: number) {
  return `${(ms / 1000).toFixed(1)}s`
}
