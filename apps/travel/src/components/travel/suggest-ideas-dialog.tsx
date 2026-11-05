import * as React from "react"
import { Loader2Icon, SparklesIcon } from "lucide-react"
import { toast } from "sonner"

import { ActivityTypeIcon } from "@/components/travel/type-icon"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import { createIdeas, suggestIdeas, type IdeaItem, type MadePlan } from "@/lib/api/travel/trip-draft"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import type { ActivityType } from "@/lib/travel/activity-types"
import { getTravelErrorMessage } from "@/lib/travel/errors"
import { showErrorToast } from "@/lib/toast/error-toast"

type Row = IdeaItem & { key: string; ticked: boolean }

const places = (count: number) => (count === 1 ? "1 place" : `${count} places`)

/**
 * Suggest Ideas, from "+ Add" (Travel features 3, part 9; Tyler, 5 Nov 2026:
 * "+ Add, checked first"). Opening it asks the AI for 10 places in the trip's
 * destination that aren't on the trip yet. They show ticked, each with why
 * it's worth going, to untick or rename; only the ticked ones go into Ideas,
 * never onto a day.
 */
export function SuggestIdeasDialog({
  open,
  tripId,
  types,
  onClose,
  onMade,
}: {
  open: boolean
  tripId: string
  types: readonly ActivityType[]
  onClose: () => void
  /** The places were added; the trip reloads, then the window closes. */
  onMade: () => Promise<void>
}) {
  // Which asking the rows on show answer, so an old answer never shows for a new one.
  const [answered, setAnswered] = React.useState(0)
  const [failed, setFailed] = React.useState<{ ask: number; reason: string } | null>(null)
  const [rows, setRows] = React.useState<Row[]>([])
  const [edited, setEdited] = React.useState(false)
  const [ask, setAsk] = React.useState(open ? 1 : 0)
  const [run, busy] = useAsyncAction(getTravelErrorMessage)
  const typesById = React.useMemo(() => new Map(types.map((type) => [type.id, type])), [types])

  // Each opening asks again, from nothing.
  const [wasOpen, setWasOpen] = React.useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) {
      setAnswered(0)
      setFailed(null)
      setRows([])
      setEdited(false)
      setAsk((was) => was + 1)
    }
  }

  // The AI's answer is the outside world's, so it lands from the request's callback.
  React.useEffect(() => {
    if (!open || ask === 0) return
    let alive = true
    suggestIdeas(tripId)
      .then(({ items }) => {
        if (!alive) return
        const fresh = items.map((item, index) => ({ ...item, key: `${ask}-${index}`, ticked: true }))
        setAnswered(ask)
        setRows(fresh)
      })
      .catch((error: unknown) => {
        if (alive) setFailed({ ask, reason: getTravelErrorMessage(error) })
      })
    return () => {
      alive = false
    }
  }, [ask, open, tripId])

  const ready = answered === ask
  const reason = failed?.ask === ask ? failed.reason : null
  const reading = open && !ready && !reason
  const ticked = rows.filter((row) => row.ticked)

  const change = (key: string, patch: Partial<Row>) => {
    setEdited(true)
    setRows((was) => was.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  }

  async function create() {
    if (ticked.length === 0) {
      showErrorToast("Tick at least one place to add.")
      return
    }
    if (ticked.some((row) => !row.title.trim())) {
      showErrorToast("Give every ticked place a name, or untick it.")
      return
    }
    let made: MadePlan | null = null
    const ok = await run(async () => {
      made = await createIdeas(
        tripId,
        ticked.map(({ title, typeId }) => ({ title: title.trim(), typeId }))
      )
      await onMade()
    })
    const result = made as MadePlan | null
    if (!ok || !result) return
    const found = result.looked ? ` Google found ${result.placed} of ${result.created.length}.` : ""
    const left = result.repeated ? ` ${places(result.repeated)} already on the trip ${result.repeated === 1 ? "was" : "were"} left out.` : ""
    toast.success(`Added ${places(result.created.length)} to Ideas.${found}${left}`)
    onClose()
  }

  return (
    <FormDialog open={open} dirty={edited} busy={busy} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin" className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Suggest Ideas</DialogTitle>
            <DialogDescription>
              AI suggests places to go that aren't on the trip yet. Untick or rename any; the rest go into Ideas.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            {reading ? (
              <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground" aria-live="polite">
                <Loader2Icon className="size-4 animate-spin" aria-hidden />
                Finding places. This takes up to a minute.
              </p>
            ) : reason ? (
              <div className="grid justify-items-start gap-3 py-2">
                <p className="text-sm text-destructive">{reason}</p>
                <Button type="button" variant="outline" onClick={() => setAsk((was) => was + 1)}>
                  Try again
                </Button>
              </div>
            ) : ready ? (
              <Card size="sm">
                <CardContent className="grid gap-3">
                  {rows.map((row) => (
                    <div key={row.key} className="grid grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-x-2 gap-y-1">
                      <Checkbox
                        checked={row.ticked}
                        onCheckedChange={(on) => change(row.key, { ticked: on === true })}
                        aria-label={`Add ${row.title || "this place"}`}
                      />
                      <ActivityTypeIcon type={row.typeId ? typesById.get(row.typeId) : null} />
                      <Input
                        aria-label="Name"
                        value={row.title}
                        maxLength={200}
                        disabled={!row.ticked}
                        onChange={(event) => change(row.key, { title: event.target.value })}
                      />
                      {row.reason ? <p className="col-start-3 text-xs text-muted-foreground">{row.reason}</p> : null}
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={requestClose} disabled={busy}>
              Cancel
            </Button>
            {ready ? (
              <Button type="button" disabled={busy} onClick={() => void create()}>
                {busy ? <Loader2Icon className="size-4 animate-spin" /> : <SparklesIcon className="size-4" />}
                Add {places(ticked.length)} to Ideas
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      )}
    </FormDialog>
  )
}
