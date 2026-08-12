import * as React from "react"
import { Loader2Icon } from "lucide-react"
import { toast } from "sonner"

import { SegmentRuleBuilder } from "@/components/broadcasts/segment-rule-builder"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { ErrorBanner } from "@/components/ui/error-banner"
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { loadContactsPage, type ContactItem } from "@/lib/api/people/contacts"
import {
  countDraftSegment,
  getSegmentErrorMessage,
  getSegmentLoadErrorMessage,
  loadSegmentMembers,
  saveSegment,
  type SegmentItem,
} from "@/lib/api/people/contact-segments"
import {
  defaultSegmentRules,
  segmentCountIsNearlyEveryone,
  segmentConditionIsComplete,
  segmentRulesMatch,
  type SegmentCondition,
  type SegmentKind,
  type SegmentRuleOptions,
  type SegmentRules,
} from "@/lib/contacts/contact-segments"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { plural } from "@/lib/format/plural"
import { SEARCH_SETTLE_MS } from "@/lib/nav/list-search"

/** How many contacts the hand-picked list offers at once. */
const PICKER_PAGE_SIZE = 20
/** Long enough that changing several rule fields makes one count request. */
const LIVE_COUNT_DELAY_MS = 1200

/**
 * Writing one segment: its name, whether it is decided by rules or by hand, and
 * the rules themselves.
 *
 * Mounted fresh per segment by its key in the list page, so the draft starts
 * from the right one without an effect resetting it after the first render.
 */
export function SegmentDialog({
  open,
  segment,
  options,
  prefill,
  onClose,
  onSaved,
}: {
  open: boolean
  segment: SegmentItem | null
  options: SegmentRuleOptions
  prefill?: {
    rules: SegmentRules
    searchExcluded: boolean
  }
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const [name, setName] = React.useState(segment?.name ?? "")
  const [description, setDescription] = React.useState(
    segment?.description ?? ""
  )
  const [kind, setKind] = React.useState<SegmentKind>(segment?.kind ?? "rules")
  const [conditions, setConditions] = React.useState<SegmentCondition[]>(
    segment?.kind === "rules"
      ? segment.rules.conditions
      : (prefill?.rules.conditions ?? defaultSegmentRules().conditions)
  )
  const [match, setMatch] = React.useState<"all" | "any">(
    segment?.kind === "rules"
      ? segmentRulesMatch(segment.rules)
      : segmentRulesMatch(prefill?.rules ?? defaultSegmentRules())
  )
  const [chosen, setChosen] = React.useState<string[]>([])
  /** The people the window opened holding, so "dirty" can tell them apart. */
  const [openedWith, setOpenedWith] = React.useState<string[]>([])
  const [saving, setSaving] = React.useState(false)
  const [nameInvalid, setNameInvalid] = React.useState(false)
  const nameInputRef = React.useRef<HTMLInputElement>(null)
  /** Email addresses for everybody chosen, including those off the search. */
  const [knownEmails, setKnownEmails] = React.useState<Record<string, string>>(
    {}
  )

  // A hand-picked segment's people live in their own table, so the window asks
  // for them once it opens rather than being handed them with the list.
  React.useEffect(() => {
    if (!open || !segment || segment.kind !== "static") return
    let active = true
    loadSegmentMembers(segment.id)
      .then(({ members }) => {
        if (!active) return
        const ids = members.map((member) => member.id)
        setChosen(ids)
        setOpenedWith(ids)
        setKnownEmails((current) => ({
          ...current,
          ...Object.fromEntries(
            members.map((member) => [member.id, member.email])
          ),
        }))
      })
      .catch((error) => showErrorToast(getSegmentErrorMessage(error)))
    return () => {
      active = false
    }
  }, [open, segment])

  const dirty =
    name !== (segment?.name ?? "") ||
    description !== (segment?.description ?? "") ||
    kind !== (segment?.kind ?? "rules") ||
    match !==
      segmentRulesMatch(
        segment?.kind === "rules"
          ? segment.rules
          : (prefill?.rules ?? defaultSegmentRules())
      ) ||
    JSON.stringify(conditions) !==
      JSON.stringify(
        segment?.kind === "rules"
          ? segment.rules.conditions
          : (prefill?.rules.conditions ?? defaultSegmentRules().conditions)
      ) ||
    JSON.stringify([...chosen].sort()) !==
      JSON.stringify([...openedWith].sort())

  const handleSave = async () => {
    dismissErrorToast()

    const missingName = !name.trim()
    setNameInvalid(missingName)
    if (missingName) {
      showErrorToast(getSegmentErrorMessage(new Error("SEGMENT_NAME_REQUIRED")))
      return
    }
    if (kind === "rules" && conditions.some((c) => !segmentConditionIsComplete(c))) {
      showErrorToast(
        getSegmentErrorMessage(new Error("SEGMENT_RULE_INCOMPLETE"))
      )
      return
    }
    setSaving(true)
    try {
      await saveSegment(segment?.id ?? null, {
        name,
        description,
        kind,
        rules: {
          ...(kind === "rules" && match === "any" ? { match } : {}),
          conditions: kind === "rules" ? conditions : [],
        },
        contactIds: kind === "static" ? chosen : [],
      })
      toast.success(segment ? "Segment saved." : "Segment created.")
      await onSaved()
    } catch (error) {
      showErrorToast(getSegmentErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormDialog open={open} dirty={dirty} busy={saving} onClose={onClose}>
      {(requestClose) => (
        <DialogContent
          variant="admin"
          onOpenAutoFocus={(event) => {
            if (segment) return
            event.preventDefault()
            nameInputRef.current?.focus()
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {segment ? "Edit segment" : "New segment"}
            </DialogTitle>
            <DialogDescription>
              A group of contacts with a name on it, so everything else can point
              at the name instead of describing the group again.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault()
              void handleSave()
            }}
          >
            <DialogBody>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>What this segment is</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-2">
                    <FieldLabel
                      htmlFor="segment-name"
                      hint="How you will refer to it everywhere else — for example, Paying members who joined this year."
                    >
                      Name
                    </FieldLabel>
                    <Input
                      id="segment-name"
                      ref={nameInputRef}
                      value={name}
                      aria-invalid={nameInvalid || undefined}
                      onChange={(event) => {
                        setName(event.target.value)
                        if (event.target.value.trim()) setNameInvalid(false)
                      }}
                    />
                  </div>
                  <div className="grid gap-2">
                    <FieldLabel
                      htmlFor="segment-description"
                      hint="Optional. A line for whoever reads this list in six months."
                    >
                      Description
                    </FieldLabel>
                    <Textarea
                      id="segment-description"
                      rows={1}
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <FieldLabel
                      htmlFor="segment-kind"
                      hint="Rules are worked out fresh every time, so somebody who unsubscribes drops out on their own. Hand-picked is a fixed list of people you choose."
                    >
                      How the people are decided
                    </FieldLabel>
                    <Select
                      value={kind}
                      onValueChange={(value) => setKind(value as SegmentKind)}
                    >
                      <SelectTrigger
                        id="segment-kind"
                        className="w-full sm:w-fit"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="rules">By rules</SelectItem>
                        <SelectItem value="static">Hand-picked</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              {kind === "rules" ? (
                <>
                  <SegmentRuleBuilder
                    conditions={conditions}
                    onChange={setConditions}
                    match={match}
                    onMatchChange={setMatch}
                    options={options}
                    excludeSegmentId={segment?.id}
                    title="Rules"
                    description={
                      prefill
                        ? `Started with the filters from the contacts list.${prefill.searchExcluded ? " Search words are not included; only the filters will be saved." : ""}`
                        : "The count below is exactly what these rules say — including the “on the list” rule, which drops somebody the moment they opt out."
                    }
                    emptyText="No rules yet, so this segment is every contact you have — people who opted out included."
                  />
                  <SegmentLiveCount
                    key={JSON.stringify({ match, conditions })}
                    rules={{
                      ...(match === "any" ? { match } : {}),
                      conditions,
                    }}
                  />
                </>
              ) : (
                <>
                  <ContactPicker
                    chosen={chosen}
                    knownEmails={knownEmails}
                    onToggle={(contact) => {
                      setKnownEmails((current) => ({
                        ...current,
                        [contact.id]: contact.email,
                      }))
                      setChosen((current) =>
                        current.includes(contact.id)
                          ? current.filter((id) => id !== contact.id)
                          : [...current, contact.id]
                      )
                    }}
                  />
                  <ChosenPeopleCount count={chosen.length} />
                </>
              )}
            </DialogBody>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={requestClose}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2Icon className="animate-spin" /> : null}
                {segment ? "Save changes" : "Create segment"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
}

type LiveCountState =
  | { status: "counting" }
  | { status: "ready"; matching: number; everyone: number }
  | { status: "error"; message: string }

/** The draft's current reach, recalculated only after its rules settle. */
function SegmentLiveCount({ rules: draft }: { rules: SegmentRules }) {
  const [attempt, setAttempt] = React.useState(0)
  const [state, setState] = React.useState<LiveCountState>({
    status: "counting",
  })
  // The parent keys this component by its conditions, so this checked request
  // shape stays fixed for the lifetime of one count and one retry.
  const [rules] = React.useState(() => ({
    ...(draft.match === "any" ? { match: "any" as const } : {}),
    conditions: draft.conditions.filter(segmentConditionIsComplete),
  }))
  const unfinished = rules.conditions.length !== draft.conditions.length

  React.useEffect(() => {
    let active = true
    const timer = setTimeout(() => {
      countDraftSegment(rules)
        .then((result) => {
          if (active) setState({ status: "ready", ...result })
        })
        .catch((error) => {
          if (active) {
            setState({
              status: "error",
              message: getSegmentLoadErrorMessage(error),
            })
          }
        })
    }, LIVE_COUNT_DELAY_MS)

    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [attempt, rules])

  const retry = () => {
    setState({ status: "counting" })
    setAttempt((current) => current + 1)
  }

  return (
    <Card size="sm" aria-live="polite">
      <CardHeader>
        <CardTitle>Live count</CardTitle>
        <CardDescription>
          {state.status === "counting" ? (
            <span className="flex items-center gap-2">
              <Loader2Icon className="size-4 animate-spin" />
              Counting…
            </span>
          ) : state.status === "error" ? (
            "We could not count these conditions right now."
          ) : state.matching === 0 ? (
            "Nobody matches these conditions right now."
          ) : (
            <>
              Matches {state.matching.toLocaleString()} {plural(state.matching, "person", "people")} right now.
              {segmentCountIsNearlyEveryone(state.matching, state.everyone)
                ? " That is nearly everyone on your list."
                : ""}
            </>
          )}
          {unfinished
            ? " An unfinished rule is not included in this count yet."
            : ""}
        </CardDescription>
      </CardHeader>
      {state.status === "error" ? (
        <ErrorBanner message={state.message} onRetry={retry} />
      ) : null}
    </Card>
  )
}

/** The hand-picked kind needs no server trip: its draft already holds the ids. */
function ChosenPeopleCount({ count }: { count: number }) {
  return (
    <Card size="sm" aria-live="polite">
      <CardHeader>
        <CardTitle>Live count</CardTitle>
        <CardDescription>
          {count
            ? `${count.toLocaleString()} ${plural(count, "person", "people")} chosen right now.`
            : "Nobody chosen right now."}
        </CardDescription>
      </CardHeader>
    </Card>
  )
}

/**
 * Choosing people by hand.
 *
 * Two lists, and the order of them is the point. The matches stay exactly where
 * they are as you tick them — a list that reshuffled on every tick would move
 * the next person you were reaching for. Anyone already chosen who the current
 * search does not match is listed above it instead, so a search can never
 * quietly drop somebody you had already picked.
 */
function ContactPicker({
  chosen,
  knownEmails,
  onToggle,
}: {
  chosen: string[]
  knownEmails: Record<string, string>
  onToggle: (contact: { id: string; email: string }) => void
}) {
  const [search, setSearch] = React.useState("")
  const [results, setResults] = React.useState<ContactItem[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    let active = true
    // The wait is the same 250ms the dashboards already settle on before
    // fetching, and "Looking…" appears when the trip actually starts rather
    // than on every keystroke.
    const timer = setTimeout(() => {
      setLoading(true)
      loadContactsPage({
        search: search.trim() || undefined,
        limit: PICKER_PAGE_SIZE,
      })
        .then((data) => {
          if (active) setResults(data.contacts)
        })
        .catch((error) => {
          if (active) showErrorToast(getSegmentErrorMessage(error))
        })
        .finally(() => {
          if (active) setLoading(false)
        })
    }, SEARCH_SETTLE_MS)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [search])

  const onThisPage = new Set(results.map((contact) => contact.id))
  const elsewhere = chosen.filter((id) => !onThisPage.has(id))

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Who is in it</CardTitle>
        <CardDescription>
          {chosen.length
            ? `${chosen.length} ${plural(chosen.length, "person", "people")} chosen. A hand-picked segment stays exactly as you leave it — nobody joins or leaves it on their own.`
            : "Nobody yet, which is fine — save it empty and fill it from the contacts list, by ticking people there and choosing this segment in the toolbar."}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-2">
          <FieldLabel
            htmlFor="segment-people-search"
            hint="Searches email addresses and names. The first twenty matches are shown."
          >
            Find somebody
          </FieldLabel>
          <Input
            id="segment-people-search"
            value={search}
            placeholder="ada@example.com"
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <div className="grid gap-2">
          {elsewhere.map((id) => (
            <div key={id} className="flex items-center gap-2">
              <Checkbox
                id={`segment-contact-${id}`}
                checked
                onCheckedChange={() =>
                  onToggle({ id, email: knownEmails[id] ?? id })
                }
              />
              <Label htmlFor={`segment-contact-${id}`} className="font-normal">
                {knownEmails[id] ?? "This contact"}
              </Label>
            </div>
          ))}

          {loading ? (
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" />
              Looking…
            </span>
          ) : results.length === 0 ? (
            <span className="text-sm text-muted-foreground">
              Nobody matches that.
            </span>
          ) : (
            results.map((contact) => (
              <div key={contact.id} className="flex items-center gap-2">
                <Checkbox
                  id={`segment-contact-${contact.id}`}
                  checked={chosen.includes(contact.id)}
                  onCheckedChange={() => onToggle(contact)}
                />
                <Label
                  htmlFor={`segment-contact-${contact.id}`}
                  className="font-normal"
                >
                  {contact.email}
                </Label>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}
