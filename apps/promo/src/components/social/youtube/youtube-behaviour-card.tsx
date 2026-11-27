import * as React from "react"
import { Loader2Icon } from "lucide-react"

import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { useReportedSaveStatus } from "@/components/settings/use-reported-save-status"
import { NumberField } from "@/components/ui/number-field"
import { getYoutubeErrorMessage, loadYoutubeSettings, saveYoutubeBehaviour, type YoutubeSettings } from "@/lib/api/social/youtube"
import { UPLOADS_PER_DAY } from "@/lib/social/youtube/options"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

const SAVE_DELAY_MS = 700

/**
 * YouTube's number as last read or edited (`held`), kept while the page is
 * open so the tab draws at once when opened again, and as the server last
 * confirmed it (`saved`), which a refused save goes back to. Browser only.
 */
const memory: { held: YoutubeSettings | null; saved: YoutubeSettings | null } = { held: null, saved: null }

/**
 * Settings → Behaviour, under YouTube: how many videos one channel may
 * upload in a day, Shorts included (YouTube task, part 3). Tyler, 26 Nov
 * 2026: "Start at 3 a day". Saves itself like the rest of the tab, 700ms after
 * the last keystroke or when the field is left.
 */
export function YoutubeBehaviourCard() {
  const [settings, setSettings] = React.useState<YoutubeSettings | null>(() => (typeof window === "undefined" ? null : memory.held))
  const [error, setError] = React.useState<string | null>(null)
  const setSaveStatus = useReportedSaveStatus()
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const latestSave = React.useRef(0)

  // Read on every open, quietly when something is already held.
  React.useEffect(() => {
    let live = true
    loadYoutubeSettings().then(
      (next) => {
        memory.held = next
        memory.saved = next
        if (live) setSettings(next)
      },
      (failure: unknown) => {
        if (live && !memory.held) setError(getYoutubeErrorMessage(failure))
      }
    )
    return () => {
      live = false
    }
  }, [])

  // A save still waiting when the tab closes is dropped with it.
  React.useEffect(() => () => clearTimeout(timer.current), [])

  async function save(next: YoutubeSettings) {
    clearTimeout(timer.current)
    const turn = ++latestSave.current
    setSaveStatus("saving")
    dismissErrorToast()
    try {
      const answer = await saveYoutubeBehaviour(next)
      memory.saved = answer
      if (turn !== latestSave.current) return
      memory.held = answer
      setSettings(answer)
      setSaveStatus("saved")
    } catch (failure) {
      if (turn !== latestSave.current) return
      memory.held = memory.saved
      setSettings(memory.saved)
      setSaveStatus("idle")
      showErrorToast(getYoutubeErrorMessage(failure))
    }
  }

  function change(uploadsPerDay: number) {
    const next = { uploadsPerDay }
    memory.held = next
    setSettings(next)
    clearTimeout(timer.current)
    if (uploadsPerDay < UPLOADS_PER_DAY.min || uploadsPerDay > UPLOADS_PER_DAY.max) return
    timer.current = setTimeout(() => void save(next), SAVE_DELAY_MS)
  }

  return (
    <CollapsibleSettingsCard storageId="promo-behaviour-youtube" title="YouTube" description="How many videos each channel may upload in a day." contentClassName="grid gap-4">
      {error ? (
        <p className="text-sm text-muted-foreground">YouTube&apos;s settings could not be read. {error}</p>
      ) : !settings ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2Icon className="size-4 animate-spin" />
          Reading YouTube&apos;s settings
        </p>
      ) : (
        <>
          <NumberField
            id="promo-youtube-uploadsPerDay"
            label="Uploads a day, for each channel"
            hint="Most videos and Shorts one channel uploads in any 24 hours. Uploads on their way count too. Past it, Post is refused and says when the next one is allowed. At half pace after a ban nearby, half this number."
            value={settings.uploadsPerDay}
            min={UPLOADS_PER_DAY.min}
            max={UPLOADS_PER_DAY.max}
            inputClassName="w-full sm:w-32"
            onChange={change}
            onCommit={() => {
              if (settings.uploadsPerDay >= UPLOADS_PER_DAY.min && settings.uploadsPerDay <= UPLOADS_PER_DAY.max) void save(settings)
            }}
          />
          <p className="text-sm text-muted-foreground">
            Each YouTube channel may upload {settings.uploadsPerDay} {settings.uploadsPerDay === 1 ? "video" : "videos"} a day, long videos and Shorts together.
          </p>
        </>
      )}
    </CollapsibleSettingsCard>
  )
}
