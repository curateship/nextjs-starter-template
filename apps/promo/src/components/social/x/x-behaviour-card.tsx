import * as React from "react"
import { Link } from "@tanstack/react-router"
import { Loader2Icon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { useReportedSaveStatus } from "@/components/settings/use-reported-save-status"
import { Hint } from "@/components/social/hint"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Label } from "@/components/ui/label"
import { NumberField } from "@/components/ui/number-field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { changeXSearcher, getXErrorMessage, loadXBehaviour, saveXBehaviour, type SearcherView, type XSettings } from "@/lib/api/social/x"
import { X_BEHAVIOUR_RANGES, type XBehaviourNumber } from "@/lib/social/x/options"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

const SAVE_DELAY_MS = 700

type XBehaviour = { searchers: SearcherView[]; settings: XSettings }

/**
 * X's part as last read or edited (`held`), held while the page is open so
 * the tab draws at once when opened again, and X's numbers as the server last
 * confirmed them (`saved`), which a refused save goes back to. Browser only.
 */
const memory: { held: XBehaviour | null; saved: XSettings | null } = { held: null, saved: null }

/** Keeps a fresh read, both as held and as confirmed. */
function rememberRead(next: XBehaviour) {
  memory.held = next
  memory.saved = next.settings
}

/** Keeps numbers the server confirmed, and holds them unless a newer save is on its way. */
function rememberSaved(settings: XSettings, newest: boolean) {
  memory.saved = settings
  if (newest && memory.held) memory.held = { ...memory.held, settings }
}

/** Puts the held numbers back to the last confirmed ones after a refused save, and returns them. */
function forgetEdit(): XSettings | null {
  if (memory.held && memory.saved) memory.held = { ...memory.held, settings: memory.saved }
  return memory.saved
}

/** Holds an edit at once, before its save goes out. */
function rememberEdit(next: XBehaviour) {
  memory.held = next
}

/** Each number's label and what it does. Tyler's answers of 21 Oct 2026 set where they start (`posting.ts`, `searchers.ts`, `follows.ts`). */
const NUMBERS: Array<{ key: XBehaviourNumber; label: string; hint: string }> = [
  {
    key: "repliesPerDay",
    label: "Replies a day, for a young X account",
    hint: "Most replies and posts a young X account sends in a day. Replies, quotes, answers and its own posts all count. Past it, Post is refused and says when the next one is allowed. Accounts past the young days have no daily number.",
  },
  {
    key: "repliesPerHour",
    label: "Replies an hour, for a young X account",
    hint: "Most replies and posts a young X account sends in any one hour, so the day's number isn't used up at once. It can't be more than replies a day.",
  },
  {
    key: "viewsPerDay",
    label: "Posts each search account may see a day",
    hint: 'Most posts each search account reads in a day. At the number, that search account reads nothing more until midnight UTC, so X never shows it the "rate limit exceeded" screen.',
  },
  {
    key: "followsPerDay",
    label: "Follows a day, for each X account",
    hint: "Most people each X account follows in a day, in its waking hours. Only accounts with Follow the people it replies to switched on follow anyone. A follow past the number is dropped, not saved for tomorrow.",
  },
]

/**
 * Settings → Behaviour, under X: the search accounts and X's own numbers
 * (`workspace/tasks/X/01-x-features.md`, parts 3 to 5, 28 and 44).
 *
 * X shows no search and no replies to a visitor who is not signed in, so a
 * signed-out reader can't read X. A search account is a browser profile
 * signed in to a throwaway X account that only ever reads. It is never
 * offered as an account that posts. Several take turns, each up to the views
 * number a day.
 *
 * Saves itself like the rest of the tab: a pick at once, a number 700ms after
 * the last keystroke or when the field is left.
 */
export function XBehaviourCard({
  profiles,
}: {
  /** Profiles that hold no account and are not the reader, the ones a search account can be. */
  profiles: Array<{ id: string; name: string }>
}) {
  const [view, setView] = React.useState<XBehaviour | null>(() => (typeof window === "undefined" ? null : memory.held))
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [removing, setRemoving] = React.useState<SearcherView | null>(null)
  const setSaveStatus = useReportedSaveStatus()
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const latestSave = React.useRef(0)

  const read = React.useCallback(async () => {
    const next = await loadXBehaviour()
    rememberRead(next)
    setView(next)
  }, [])

  // Read on every open, quietly when something is already held.
  React.useEffect(() => {
    let live = true
    loadXBehaviour().then(
      (next) => {
        rememberRead(next)
        if (live) setView(next)
      },
      (failure: unknown) => {
        if (live && !memory.held) setError(getXErrorMessage(failure))
      }
    )
    return () => {
      live = false
    }
  }, [])

  // A save still waiting when the tab closes is dropped with it.
  React.useEffect(() => () => clearTimeout(timer.current), [])

  async function save(next: XSettings) {
    clearTimeout(timer.current)
    const turn = ++latestSave.current
    setSaveStatus("saving")
    dismissErrorToast()
    try {
      const answer = await saveXBehaviour(next)
      rememberSaved(answer, turn === latestSave.current)
      if (turn !== latestSave.current) return
      setView((current) => (current ? { ...current, settings: answer } : current))
      setSaveStatus("saved")
    } catch (failure) {
      if (turn !== latestSave.current) return
      const back = forgetEdit()
      setView((current) => (current && back ? { ...current, settings: back } : current))
      setSaveStatus("idle")
      showErrorToast(getXErrorMessage(failure))
    }
  }

  function change(patch: Partial<XSettings>) {
    if (!view) return
    const next = { ...view, settings: { ...view.settings, ...patch } }
    rememberEdit(next)
    setView(next)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => void save(next.settings), SAVE_DELAY_MS)
  }

  async function searcherChange(change: Parameters<typeof changeXSearcher>[0], done: string) {
    setBusy(true)
    setSaveStatus("saving")
    try {
      await changeXSearcher(change)
      await read()
      setSaveStatus("saved")
      toast.success(done)
      return true
    } catch (failure) {
      setSaveStatus("idle")
      showErrorToast(getXErrorMessage(failure))
      return false
    } finally {
      setBusy(false)
    }
  }

  const searchers = view?.searchers ?? []
  const free = profiles.filter((profile) => !searchers.some((searcher) => searcher.profileId === profile.id))

  return (
    <CollapsibleSettingsCard
      storageId="promo-behaviour-x"
      title="X"
      description="The search accounts that read X for every project, and X's own numbers."
      contentClassName="grid gap-4"
    >
      {error ? (
        <p className="text-sm text-muted-foreground">X&apos;s settings could not be read. {error}</p>
      ) : !view ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2Icon className="size-4 animate-spin" />
          Reading X&apos;s settings
        </p>
      ) : (
        <>
          <div className="grid gap-2">
            <p className="text-sm font-medium">Search accounts</p>
            {searchers.length ? (
              <ul className="grid gap-2">
                {searchers.map((searcher) => (
                  <li key={searcher.id} className="flex min-w-0 items-center gap-3 rounded-lg border p-3">
                    <span className="grid min-w-0 flex-1 gap-0.5">
                      <span className="truncate text-sm">
                        {searcher.profileName}
                        <span className="text-muted-foreground"> · {searcher.handle ? `signed in as @${searcher.handle}` : "not seen signed in yet"}</span>
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {searcher.viewsToday} of {searcher.viewsPerDay} views today
                      </span>
                      {searcher.stoppedReason ? <span className="text-xs text-amber-700 dark:text-amber-400">{searcher.stoppedReason}</span> : null}
                    </span>
                    <Hint label={`Stop ${searcher.profileName} searching X`}>
                      <Button type="button" variant="ghost" size="icon" aria-label={`Stop ${searcher.profileName} searching X`} onClick={() => setRemoving(searcher)}>
                        <Trash2Icon className="size-4" />
                      </Button>
                    </Hint>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-destructive">There is no X search account, so nothing on X is read and every X search is refused.</p>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="promo-x-add-searcher">Add a search account</Label>
            <Select
              value=""
              disabled={busy}
              onValueChange={(profileId) => {
                const profile = free.find((item) => item.id === profileId)
                void searcherChange({ change: "add", profileId }, `${profile?.name ?? "The profile"} searches X now. Sign it in to a throwaway X account that never posts.`)
              }}
            >
              <SelectTrigger id="promo-x-add-searcher" className="w-full sm:w-fit sm:min-w-64">
                <SelectValue placeholder={free.length ? "Pick a browser profile" : "No free browser profile"} />
              </SelectTrigger>
              <SelectContent>
                {free.length ? (
                  free.map((profile) => (
                    <SelectItem key={profile.id} value={profile.id}>
                      {profile.name}
                    </SelectItem>
                  ))
                ) : (
                  <p className="px-2 py-1.5 text-sm text-muted-foreground">Every free profile searches X already, or is the reader.</p>
                )}
              </SelectContent>
            </Select>
          </div>
          <p className="text-sm text-muted-foreground">
            X shows nothing to a visitor who is not signed in, so X is read by a browser profile signed in to a throwaway X account that only ever reads.
            It is never offered as an account that replies or posts. Profiles that hold an account, and the reader, are not offered. Make a new one, with a
            proxy of its own, on the{" "}
            <Link to="/admin/profiles" search={{ open: undefined }} className="font-medium text-foreground underline underline-offset-2">
              Browser profiles dashboard
            </Link>
            , and sign it in to X there. With two or more, each read goes to the one with the most views left. A search account X has stopped for the day is skipped until tomorrow.
          </p>
          {NUMBERS.map((number) => (
            <NumberField
              key={number.key}
              id={`promo-x-${number.key}`}
              label={number.label}
              hint={number.hint}
              value={view.settings[number.key]}
              min={X_BEHAVIOUR_RANGES[number.key].min}
              max={X_BEHAVIOUR_RANGES[number.key].max}
              inputClassName="w-full sm:w-32"
              onChange={(value) => change({ [number.key]: value })}
              onCommit={() => void save(view.settings)}
            />
          ))}
          <p className="text-sm text-muted-foreground">
            A young X account may send {view.settings.repliesPerHour} an hour and {view.settings.repliesPerDay} a day. Each search account sees up to{" "}
            {view.settings.viewsPerDay} posts a day, and each X account follows up to {view.settings.followsPerDay} people a day.
          </p>
        </>
      )}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => (open ? null : setRemoving(null))}
        title={`Stop ${removing?.profileName ?? "this profile"} searching X?`}
        description="Its waiting reads go to another search account. The profile and its sign-in stay as they are."
        confirmLabel="Stop searching"
        loading={busy}
        onConfirm={() =>
          removing
            ? void searcherChange({ change: "remove", searcherId: removing.id }, `${removing.profileName} no longer searches X.`).then((done) => {
                if (done) setRemoving(null)
              })
            : undefined
        }
      />
    </CollapsibleSettingsCard>
  )
}
