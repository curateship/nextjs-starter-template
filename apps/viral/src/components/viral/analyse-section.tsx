import * as React from "react"
import { createPortal } from "react-dom"
import { ArchiveIcon, CheckIcon, Loader2Icon, SendIcon, SparklesIcon } from "lucide-react"
import { toast } from "sonner"

import { FoldingMenu } from "@/components/shared/folding-menu"
import { InspectorCard } from "@/components/shared/inspector-card"
import { Button } from "@/components/ui/button"
import { ErrorRow } from "@/components/ui/error-row"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LoadingRow } from "@/components/ui/loading-row"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AnalysisCards } from "@/components/viral/analysis-cards"
import { FitLabel, SendToVideoButton, TipButton } from "@/components/viral/send-to-video"
import { SavingTextarea } from "@/components/viral/saving-fields"
import { getViralErrorMessage } from "@/lib/api/viral/viral"
import {
  analyseViralVideo,
  loadAnalyses,
  loadAnalysisPrice,
  saveAnalysisNotesFn,
  type AnalysisPrice,
  type ViralAnalysis,
} from "@/lib/api/viral/viral-analysis"
import { loadVaultItemFn, saveToVaultFn, type VaultItem } from "@/lib/api/viral/viral-vault"
import type { SavedVideoDetail } from "@/lib/api/viral/viral-videos"
import { showErrorToast } from "@/lib/toast/error-toast"
import { ANALYSIS_NOTES_MAX, ANALYSIS_TOPIC_MAX } from "@/lib/viral/analysis"
import { formatCents } from "@/lib/viral/project-spend"
import type { ViralVideo } from "@/lib/viral/viral"

/** While the AI watches a video, the panel asks how it is doing this often. */
const WAITING_POLL_MS = 3_000

type Analyses = { analyses: ViralAnalysis[]; pendingTopic: string | null; error: string | null }

/**
 * Analyse with AI, under the player (task parts 15 to 17 and 22): the topic
 * the script is written for, the project's unless changed here for this
 * video, and what it costs; then the four pieces, a Notes box, Save to
 * vault and Send to Video.
 *
 * A video that has not been watched yet is downloaded and broken down
 * first; the server keeps the topic on it and writes the analysis once the
 * breakdown lands, so closing the panel loses nothing. Each topic keeps its
 * own analysis, newest first.
 */
export function AnalyseSection({
  video,
  saved,
  onSaved,
  projectId,
  projectTopic,
  onVaultChanged,
  footer,
}: {
  video: ViralVideo
  saved: SavedVideoDetail | null
  onSaved: (detail: SavedVideoDetail) => void
  projectId: string
  projectTopic: string
  /** The video went into the vault, or its vault item changed. */
  onVaultChanged: () => void | Promise<void>
  /**
   * The right panel's sticky footer, under its scrolling body (Tyler, 4 Nov
   * 2026: "this should be in the sticky footer"). Save to vault and Send to
   * Video are drawn into it, so they stay in reach however far the panel is
   * scrolled. Null until the footer is on the page.
   */
  footer: HTMLElement | null
}) {
  const [topic, setTopic] = React.useState(projectTopic)
  // The project's topic changed in its ⋮ while this video is open: an untouched box follows it.
  const [topicFrom, setTopicFrom] = React.useState(projectTopic)
  if (topicFrom !== projectTopic) {
    setTopicFrom(projectTopic)
    if (topic === topicFrom) setTopic(projectTopic)
  }
  const [price, setPrice] = React.useState<AnalysisPrice | null>(null)
  const [list, setList] = React.useState<Analyses | null>(null)
  const [pickedId, setPickedId] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState<"analyse" | "vault" | null>(null)
  const [vaultItem, setVaultItem] = React.useState<VaultItem | null>(null)
  // The notes typed under the open analysis, which Save to vault carries.
  const [notes, setNotes] = React.useState<Record<string, string>>({})
  // The same, written the moment the box is left. Pressing Save to vault leaves the box, and its
  // click runs before the notes' own save answers, so it reads these rather than the state.
  const typedNotes = React.useRef<Record<string, string>>({})

  const savedId = saved?.id ?? null
  const breakdownReady = saved?.status === "ready"

  // What one more analysis costs, from the video's length and whether its breakdown is done.
  React.useEffect(() => {
    let live = true
    loadAnalysisPrice(video.durationSeconds, breakdownReady)
      .then((answer) => {
        if (live) setPrice(answer)
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [breakdownReady, video.durationSeconds])

  const read = React.useCallback(async (id: string) => {
    const answer = await loadAnalyses(id)
    setList(answer)
    return answer
  }, [])

  React.useEffect(() => {
    if (!savedId) return
    let live = true
    loadAnalyses(savedId)
      .then((answer) => {
        if (live) setList(answer)
      })
      .catch((error) => {
        if (live) showErrorToast(getViralErrorMessage(error))
      })
    return () => {
      live = false
    }
  }, [savedId])

  // Waiting for the worker: ask again until the analysis lands or fails.
  const waiting = Boolean(list?.pendingTopic) && !list?.error
  React.useEffect(() => {
    if (!savedId || !waiting) return
    const timer = setInterval(() => void read(savedId).catch(() => undefined), WAITING_POLL_MS)
    return () => clearInterval(timer)
  }, [read, savedId, waiting])

  const vaultItemId = video.vaultItemId
  React.useEffect(() => {
    if (!vaultItemId) return
    let live = true
    loadVaultItemFn(vaultItemId)
      .then((item) => {
        if (live) setVaultItem(item)
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [vaultItemId])

  const analyses = list?.analyses ?? []
  const open = analyses.find((one) => one.id === pickedId) ?? analyses[0] ?? null

  async function analyse() {
    if (busy) return
    if (video.sample) {
      showErrorToast("This is a made-up sample video, so there is nothing for the AI to watch. Make your own project to try it.")
      return
    }
    if (!topic.trim()) {
      showErrorToast("Say what you make, and for whom, so the script is written for it.")
      return
    }
    setBusy("analyse")
    setAnalyseOpen(false)
    try {
      const answer = await analyseViralVideo({ projectId, url: video.url, topic })
      onSaved(answer.savedVideo)
      if (answer.state === "written") {
        setList((was) => ({ analyses: [answer.analysis, ...(was?.analyses ?? [])], pendingTopic: null, error: null }))
        setPickedId(answer.analysis.id)
      } else {
        await read(answer.savedVideo.id)
        toast.message("The AI is watching it first. The analysis shows here when it's written; you can keep browsing.")
      }
    } catch (error) {
      showErrorToast(getViralErrorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  // Send to Video pressed before the video was in the vault: it is saved first, then the picker opens.
  const [sendAfterSave, setSendAfterSave] = React.useState(false)

  async function saveToVault(): Promise<boolean> {
    if (busy) return false
    if (video.sample) {
      showErrorToast("A sample's videos are made up, so they can't be kept. Make your own project to try it.")
      return false
    }
    setBusy("vault")
    try {
      const item = await saveToVaultFn({
        projectId,
        url: video.url,
        analysisId: open?.id ?? null,
        notes: open ? (typedNotes.current[open.id] ?? notes[open.id] ?? open.notes) : "",
      })
      setVaultItem(item)
      await onVaultChanged()
      return true
    } catch (error) {
      showErrorToast(getViralErrorMessage(error))
      return false
    } finally {
      setBusy(null)
    }
  }

  const topicChanged = topic.trim() !== projectTopic.trim()
  const [analyseOpen, setAnalyseOpen] = React.useState(false)
  const analyseWord = waiting ? "Analysing…" : analyses.length ? "Analyse again" : "Analyse with AI"

  // The Analyse button sits in the footer beside Save and Send; it opens a dropdown with the topic, the price
  // and the button that runs it (Tyler, 4 Nov 2026: "add the anaylyze button here ... clicking on it opens up
  // the dropdown (topic) and remove the card since we dont need it").
  const analyseMenu = (
    <FoldingMenu
      label="Analyse with AI"
      align="end"
      open={analyseOpen}
      onOpenChange={setAnalyseOpen}
      trigger={
        <TipButton type="button" className="w-full min-w-0 px-2" disabled={busy !== null || waiting} tip={analyseWord}>
          {busy === "analyse" || waiting ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
          <FitLabel full={analyseWord} />
        </TipButton>
      }
    >
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 p-4">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
          <FieldLabel
            htmlFor={`viral-analyse-topic-${video.key}`}
            hint="The project's topic. Change it here to write this one video's script for something else; the project keeps its own."
          >
            Write the script for
          </FieldLabel>
          <Input
            id={`viral-analyse-topic-${video.key}`}
            maxLength={ANALYSIS_TOPIC_MAX}
            value={topic}
            placeholder="Your topic, such as a meal-prep course for busy dads"
            onChange={(event) => setTopic(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void analyse()
            }}
          />
          {topicChanged ? <p className="text-xs text-muted-foreground">For this video only.</p> : null}
        </div>
        {price ? (
          <p className="text-xs text-muted-foreground">
            About {formatCents(price.cents)}
            {price.breakdownNeeded ? ". It downloads the video and the AI watches it first, which is most of that." : "."}
          </p>
        ) : null}
        <Button type="button" disabled={busy !== null} onClick={() => void analyse()}>
          <SparklesIcon />
          {analyses.length ? "Analyse again" : "Analyse"}
        </Button>
      </div>
    </FoldingMenu>
  )

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3">

      {waiting ? <LoadingRow label={`Writing it for ${list?.pendingTopic}`} /> : null}
      {list?.error ? <ErrorRow message={list.error} onRetry={() => void analyse()} /> : null}

      {open ? (
        <>
          {analyses.length > 1 ? (
            <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
              <Label htmlFor={`viral-analysis-pick-${video.key}`}>Analysis</Label>
              <Select value={open.id} onValueChange={setPickedId}>
                <SelectTrigger id={`viral-analysis-pick-${video.key}`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {analyses.map((one) => (
                    <SelectItem key={one.id} value={one.id}>
                      For {one.topic}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <AnalysisCards pieces={open.pieces} topic={open.topic} />
          <InspectorCard storageId="viral-analysis-notes" title="Notes">
          <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
            <Label htmlFor={`viral-analysis-notes-${open.id}`} className="sr-only">Notes</Label>
            <SavingTextarea
              key={open.id}
              id={`viral-analysis-notes-${open.id}`}
              rows={2}
              maxLength={ANALYSIS_NOTES_MAX}
              placeholder="What to keep, what to change, how you'd film it"
              value={notes[open.id] ?? open.notes}
              onSave={async (text) => {
                typedNotes.current[open.id] = text
                try {
                  await saveAnalysisNotesFn(open.id, text)
                  setNotes((was) => ({ ...was, [open.id]: text }))
                  return true
                } catch (error) {
                  showErrorToast(getViralErrorMessage(error))
                  return false
                }
              }}
            />
          </div>
          </InspectorCard>
        </>
      ) : null}

      {/* All three in one row (Tyler, 4 Nov 2026: "all 3 buttons in one row"). A narrow panel shows their icons
          alone, each named in its tooltip; with room, their words too. */}
      {footer ? createPortal(
      <div className="@container grid grid-cols-3 items-start gap-2">
        {analyseMenu}
        <TipButton
          type="button"
          variant="outline"
          className="min-w-0 px-2"
          disabled={busy !== null}
          tip={vaultItem ? "In the vault. Save again" : "Save to vault"}
          onClick={() => void saveToVault()}
        >
          {busy === "vault" ? <Loader2Icon className="animate-spin" /> : vaultItem ? <CheckIcon /> : <ArchiveIcon />}
          <FitLabel full={vaultItem ? "In vault" : "Save to vault"} />
        </TipButton>
        {/* Both buttons always show (Tyler, 4 Nov 2026: "there was 2 buttons here, where is the other"). A send
            needs a vault idea, so before the video is in the vault Send to Video saves it first. */}
        {vaultItem ? (
          <SendToVideoButton
            item={vaultItem}
            projectId={projectId}
            className="w-full min-w-0 px-2"
            startOpen={sendAfterSave}
            compact
            onChanged={(item) => {
              setVaultItem(item)
              void onVaultChanged()
            }}
          />
        ) : (
          <TipButton
            type="button"
            variant="outline"
            className="w-full min-w-0 px-2"
            tip="Send to Video"
            disabled={busy !== null}
            onClick={() =>
              void saveToVault().then((saved) => {
                if (saved) setSendAfterSave(true)
              })
            }
          >
            <SendIcon />
            <FitLabel full="Send to Video" />
          </TipButton>
        )}
      </div>,
      footer
      ) : null}
    </div>
  )
}
