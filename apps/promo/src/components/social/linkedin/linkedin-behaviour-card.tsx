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
import {
  changeLinkedinSearcher,
  getLinkedinErrorMessage,
  loadLinkedinBehaviour,
  saveLinkedinBehaviour,
  type LinkedinSearcherView,
  type LinkedinSettings,
} from "@/lib/api/social/linkedin"
import { LINKEDIN_BEHAVIOUR_RANGES, type LinkedinBehaviourNumber } from "@/lib/social/linkedin/options"
import { WORKDAY_WORDS } from "@/lib/social/linkedin/workday"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

const SAVE_DELAY_MS = 700

type LinkedinBehaviour = { searchers: LinkedinSearcherView[]; settings: LinkedinSettings }

/**
 * LinkedIn's part as last read or edited (`held`), held while the page is
 * open so the tab draws at once when opened again, and LinkedIn's numbers as
 * the server last confirmed them (`saved`), which a refused save goes back
 * to. Browser only.
 */
const memory: { held: LinkedinBehaviour | null; saved: LinkedinSettings | null } = { held: null, saved: null }

/** Keeps a fresh read, both as held and as confirmed. */
function rememberRead(next: LinkedinBehaviour) {
  memory.held = next
  memory.saved = next.settings
}

/** Keeps numbers the server confirmed, and holds them unless a newer save is on its way. */
function rememberSaved(settings: LinkedinSettings, newest: boolean) {
  memory.saved = settings
  if (newest && memory.held) memory.held = { ...memory.held, settings }
}

/** Puts the held numbers back to the last confirmed ones after a refused save, and returns them. */
function forgetEdit(): LinkedinSettings | null {
  if (memory.held && memory.saved) memory.held = { ...memory.held, settings: memory.saved }
  return memory.saved
}

/** Holds an edit at once, before its save goes out. */
function rememberEdit(next: LinkedinBehaviour) {
  memory.held = next
}

/** Each number's label and what it does. Tyler's answers of 22 Oct 2026 set where they start (`linkedin/posting.ts`, `linkedin/searchers.ts`, `linkedin/people.ts`). */
const NUMBERS: Array<{ key: LinkedinBehaviourNumber; label: string; hint: string }> = [
  {
    key: "commentsPerDay",
    label: "Comments a day, for a young LinkedIn account",
    hint: "Most comments and posts a young LinkedIn account sends in a day. Comments, replies, answers and its own posts all count. Past it, Post is refused and says when the next one is allowed. Accounts past the young days have no daily number.",
  },
  {
    key: "viewsPerDay",
    label: "Posts each search account may see a day",
    hint: "Most posts each search account reads in a day. At the number, that search account reads nothing more until midnight UTC, so LinkedIn never shows it its limit page.",
  },
  {
    key: "connectsPerWeek",
    label: "Connection requests a week, for each LinkedIn account",
    hint: "Most connection requests each LinkedIn account sends in any 7 days. Each one is sent only when you press Send. LinkedIn restricts accounts that send too many.",
  },
]

/**
 * Settings → Behaviour, under LinkedIn: the search accounts, LinkedIn's own
 * numbers and its workday hours (`workspace/tasks/LinkedIn/01-linkedin-features.md`,
 * parts 3, 7, 27 and 39).
 *
 * LinkedIn shows almost nothing to a visitor who is not signed in, so a
 * signed-out reader can't read it. A search account is a browser profile
 * signed in to a spare LinkedIn account that only ever reads. It is never
 * offered as an account that comments. Several take turns, each up to the
 * views number a day. The workday hours are Tyler's fixed answer, shown here
 * and not changed here.
 *
 * Saves itself like the rest of the tab: a pick at once, a number 700ms after
 * the last keystroke or when the field is left.
 */
export function LinkedinBehaviourCard({
  profiles,
}: {
  /** Profiles that hold no account and are not the reader, the ones a search account can be. */
  profiles: Array<{ id: string; name: string }>
}) {
  const [view, setView] = React.useState<LinkedinBehaviour | null>(() => (typeof window === "undefined" ? null : memory.held))
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [removing, setRemoving] = React.useState<LinkedinSearcherView | null>(null)
  const setSaveStatus = useReportedSaveStatus()
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const latestSave = React.useRef(0)

  const read = React.useCallback(async () => {
    const next = await loadLinkedinBehaviour()
    rememberRead(next)
    setView(next)
  }, [])

  // Read on every open, quietly when something is already held.
  React.useEffect(() => {
    let live = true
    loadLinkedinBehaviour().then(
      (next) => {
        rememberRead(next)
        if (live) setView(next)
      },
      (failure: unknown) => {
        if (live && !memory.held) setError(getLinkedinErrorMessage(failure))
      }
    )
    return () => {
      live = false
    }
  }, [])

  // A save still waiting when the tab closes is dropped with it.
  React.useEffect(() => () => clearTimeout(timer.current), [])

  async function save(next: LinkedinSettings) {
    clearTimeout(timer.current)
    const turn = ++latestSave.current
    setSaveStatus("saving")
    dismissErrorToast()
    try {
      const answer = await saveLinkedinBehaviour(next)
      rememberSaved(answer, turn === latestSave.current)
      if (turn !== latestSave.current) return
      setView((current) => (current ? { ...current, settings: answer } : current))
      setSaveStatus("saved")
    } catch (failure) {
      if (turn !== latestSave.current) return
      const back = forgetEdit()
      setView((current) => (current && back ? { ...current, settings: back } : current))
      setSaveStatus("idle")
      showErrorToast(getLinkedinErrorMessage(failure))
    }
  }

  function change(patch: Partial<LinkedinSettings>) {
    if (!view) return
    const next = { ...view, settings: { ...view.settings, ...patch } }
    rememberEdit(next)
    setView(next)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => void save(next.settings), SAVE_DELAY_MS)
  }

  async function searcherChange(change: Parameters<typeof changeLinkedinSearcher>[0], done: string) {
    setBusy(true)
    setSaveStatus("saving")
    try {
      await changeLinkedinSearcher(change)
      await read()
      setSaveStatus("saved")
      toast.success(done)
      return true
    } catch (failure) {
      setSaveStatus("idle")
      showErrorToast(getLinkedinErrorMessage(failure))
      return false
    } finally {
      setBusy(false)
    }
  }

  const searchers = view?.searchers ?? []
  const free = profiles.filter((profile) => !searchers.some((searcher) => searcher.profileId === profile.id))

  return (
    <CollapsibleSettingsCard
      storageId="promo-behaviour-linkedin"
      title="LinkedIn"
      description="The search accounts that read LinkedIn for every project, LinkedIn's own numbers and its workday hours."
      contentClassName="grid gap-4"
    >
      {error ? (
        <p className="text-sm text-muted-foreground">LinkedIn&apos;s settings could not be read. {error}</p>
      ) : !view ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2Icon className="size-4 animate-spin" />
          Reading LinkedIn&apos;s settings
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
                        <span className="text-muted-foreground"> · {searcher.slug ? `signed in as in/${searcher.slug}` : "not seen signed in yet"}</span>
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {searcher.viewsToday} of {searcher.viewsPerDay} views today
                      </span>
                      {searcher.stoppedReason ? <span className="text-xs text-amber-700 dark:text-amber-400">{searcher.stoppedReason}</span> : null}
                    </span>
                    <Hint label={`Stop ${searcher.profileName} searching LinkedIn`}>
                      <Button type="button" variant="ghost" size="icon" aria-label={`Stop ${searcher.profileName} searching LinkedIn`} onClick={() => setRemoving(searcher)}>
                        <Trash2Icon className="size-4" />
                      </Button>
                    </Hint>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-destructive">There is no LinkedIn search account, so nothing on LinkedIn is read and every LinkedIn search is refused.</p>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="promo-linkedin-add-searcher">Add a search account</Label>
            <Select
              value=""
              disabled={busy}
              onValueChange={(profileId) => {
                const profile = free.find((item) => item.id === profileId)
                void searcherChange({ change: "add", profileId }, `${profile?.name ?? "The profile"} searches LinkedIn now. Sign it in to a spare LinkedIn account that never comments.`)
              }}
            >
              <SelectTrigger id="promo-linkedin-add-searcher" className="w-full sm:w-fit sm:min-w-64">
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
                  <p className="px-2 py-1.5 text-sm text-muted-foreground">Every free profile searches LinkedIn already, or is the reader.</p>
                )}
              </SelectContent>
            </Select>
          </div>
          <p className="text-sm text-muted-foreground">
            LinkedIn shows almost nothing to a visitor who is not signed in, so LinkedIn is read by a browser profile signed in to a spare LinkedIn
            account that only ever reads. It is never offered as an account that comments or posts. Profiles that hold an account, and the reader, are not
            offered, and one that searches X is refused. Make a new one, with a proxy of its own, on the{" "}
            <Link to="/admin/profiles" search={{ open: undefined }} className="font-medium text-foreground underline underline-offset-2">
              Browser profiles dashboard
            </Link>
            , and sign it in to LinkedIn there. With two or more, each read goes to the one with the most views left. A search account LinkedIn has stopped for the day is skipped until tomorrow.
          </p>
          {NUMBERS.map((number) => (
            <NumberField
              key={number.key}
              id={`promo-linkedin-${number.key}`}
              label={number.label}
              hint={number.hint}
              value={view.settings[number.key]}
              min={LINKEDIN_BEHAVIOUR_RANGES[number.key].min}
              max={LINKEDIN_BEHAVIOUR_RANGES[number.key].max}
              inputClassName="w-full sm:w-32"
              onChange={(value) => change({ [number.key]: value })}
              onCommit={() => void save(view.settings)}
            />
          ))}
          <p className="text-sm text-muted-foreground">
            A young LinkedIn account may send {view.settings.commentsPerDay} a day. Each search account sees up to {view.settings.viewsPerDay} posts a day,
            and each LinkedIn account sends up to {view.settings.connectsPerWeek} connection requests a week.
          </p>
          <div className="grid gap-1">
            <p className="text-sm font-medium">Workday hours</p>
            <p className="text-sm text-muted-foreground">
              {WORKDAY_WORDS}. LinkedIn accounts comment, post, connect and read their own pages only then, in place of the waking hours above. Anything
              pressed outside them waits for the next workday morning.
            </p>
          </div>
        </>
      )}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => (open ? null : setRemoving(null))}
        title={`Stop ${removing?.profileName ?? "this profile"} searching LinkedIn?`}
        description="Its waiting reads go to another search account. The profile and its sign-in stay as they are."
        confirmLabel="Stop searching"
        loading={busy}
        onConfirm={() =>
          removing
            ? void searcherChange({ change: "remove", searcherId: removing.id }, `${removing.profileName} no longer searches LinkedIn.`).then((done) => {
                if (done) setRemoving(null)
              })
            : undefined
        }
      />
    </CollapsibleSettingsCard>
  )
}
