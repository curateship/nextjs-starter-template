import * as React from "react"
import { Loader2Icon } from "lucide-react"

import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { useReportedSaveStatus } from "@/components/settings/use-reported-save-status"
import { NumberField } from "@/components/ui/number-field"
import { TIDY_DAYS_RANGE } from "@/lib/social/options"
import {
  getTidyErrorMessage,
  loadTidyAfterDays,
  saveTidyAfterDaysFn,
} from "@/lib/api/social/reddit/tidy"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/** A changed number saves itself this long after the last keystroke; Enter saves at once. */
const SAVE_DELAY_MS = 700

/**
 * How long an old post is kept before the regular tidy-up deals with it.
 *
 * One number. A skipped post no search has seen for this many days is
 * deleted, and an open one loses its stored replies, which the Projects dashboard
 * offers to read again. A post with a comment against it is never touched.
 * Saves itself, with the outcome in the sticky header.
 */
export function TidyOldPostsCard() {
  const [days, setDays] = React.useState<number | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const setSaveStatus = useReportedSaveStatus()
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const load = React.useCallback(
    (): Promise<void> =>
      loadTidyAfterDays().then(
        (next) => {
          setDays(next)
          setError(null)
        },
        (failure: unknown) => setError(getTidyErrorMessage(failure))
      ),
    []
  )

  React.useEffect(() => {
    void load()
  }, [load])

  // A save still waiting when the tab closes is dropped with it.
  React.useEffect(() => () => clearTimeout(timer.current), [])

  // The number rides in as an argument, so the timer saves exactly what was
  // typed when it was set.
  async function save(next: number) {
    clearTimeout(timer.current)
    setSaveStatus("saving")
    dismissErrorToast()
    try {
      await saveTidyAfterDaysFn(next)
      setSaveStatus("saved")
    } catch (failure) {
      setSaveStatus("idle")
      showErrorToast(getTidyErrorMessage(failure))
    }
  }

  return (
    <CollapsibleSettingsCard
      storageId="promo-reddit-tidy"
      title="Tidying up old posts"
      description="Skipped posts nobody will look at again, and the replies stored with old ones."
      contentClassName="grid gap-4"
    >
      {error ? (
        <p className="text-sm text-muted-foreground">
          The setting could not be read. {error}
        </p>
      ) : days === null ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2Icon className="size-4 animate-spin" />
          Reading the setting
        </p>
      ) : (
        <>
          <NumberField
            id="promo-tidy-days"
            label="Days unseen before a skipped post goes"
            hint="Counted from the last time any search returned the post, not from when it went up."
            value={days}
            min={TIDY_DAYS_RANGE.min}
            max={TIDY_DAYS_RANGE.max}
            inputClassName="w-full sm:w-32"
            onChange={(value) => {
              setDays(value)
              clearTimeout(timer.current)
              timer.current = setTimeout(() => void save(value), SAVE_DELAY_MS)
            }}
            onCommit={() => void save(days)}
          />
          <p className="text-sm text-muted-foreground">
            {days === 0
              ? "Off. Nothing is deleted and every stored reply is kept."
              : `A skipped post no search has seen for ${days} ${days === 1 ? "day" : "days"} is deleted. A post still waiting to be looked at keeps its place but loses its stored replies, which are read again when you open it. A post you commented on is never touched.`}
          </p>
        </>
      )}
    </CollapsibleSettingsCard>
  )
}
