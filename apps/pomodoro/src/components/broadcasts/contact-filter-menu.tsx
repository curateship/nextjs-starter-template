import * as React from "react"
import { BookmarkPlusIcon, ChevronDownIcon } from "lucide-react"
import { toast } from "sonner"

import { SegmentRuleBuilder } from "@/components/broadcasts/segment-rule-builder"
import { FilterPopover } from "@/components/shared/filter-popover"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  getSegmentErrorMessage,
  saveSegment,
  type SegmentItem,
} from "@/lib/api/people/contact-segments"
import {
  cleanSegmentRules,
  segmentConditionIsComplete,
  segmentRulesMatch,
  type SegmentRuleOptions,
  type SegmentRules,
} from "@/lib/contacts/contact-segments"
import { plural } from "@/lib/format/plural"
import { quoteOneLine } from "@/lib/format/quote-text"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { showErrorToast } from "@/lib/toast/error-toast"

/** Long enough that typing a number of days is one fetch, not one per digit. */
const APPLY_DELAY_MS = 400

/**
 * The contacts list's Filter: the segment rule builder inside the shell's
 * Filter dropdown (Tyler, 19 Oct 2026), so the list and a saved segment are
 * written in the same rules. A change applies to the list a moment after it
 * is made; a rule still being filled in waits until it is finished.
 *
 * Beside Clear sits the save. With no segment open it is "Save to segment".
 * With a rules segment open it is a menu of "Update <segment>", once the
 * rules differ from the segment's, and "Save as new segment". Updating asks
 * first, because future newsletters and automations sent to that segment
 * then reach different people. A hand-picked segment's people change through
 * mass select, so with one open the save is "Save as new segment" alone.
 */
export function ContactFilterMenu({
  rules,
  options,
  total,
  searching,
  openSegment,
  segmentChanged,
  onRules,
  onSaveAsSegment,
  onUpdated,
}: {
  rules: SegmentRules
  options: SegmentRuleOptions
  /** How many people the list holds now. */
  total: number
  /** Words are in the search box, which a segment cannot save. */
  searching: boolean
  openSegment: SegmentItem | null
  segmentChanged: boolean
  onRules: (rules: SegmentRules) => void
  /** Opens the segment window holding these rules. */
  onSaveAsSegment: (rules: SegmentRules) => void
  onUpdated: () => Promise<void>
}) {
  const [open, setOpen] = React.useState(false)
  const [draft, setDraft] = React.useState(rules)
  const [confirmUpdate, setConfirmUpdate] = React.useState(false)
  const [runUpdate, updating] = useAsyncAction(getSegmentErrorMessage)
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Rules changed in the builder and not yet applied to the list. */
  const pending = React.useRef<SegmentRules | null>(null)
  // The latest `onRules`, so a change applied after a click elsewhere never
  // carries the open segment from the render it was typed in.
  const onRulesRef = React.useRef(onRules)
  React.useEffect(() => {
    onRulesRef.current = onRules
  })

  // Each opening starts from the list as it is, so a rule left unfinished
  // last time is not still sitting there.
  const [wasOpen, setWasOpen] = React.useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) setDraft(rules)
  }

  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    []
  )

  /** Applies a waiting change now, as closing the dropdown or saving does. */
  const flush = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    const next = pending.current
    pending.current = null
    if (next) onRulesRef.current(next)
  }

  const change = (next: SegmentRules) => {
    setDraft(next)
    pending.current = cleanSegmentRules({
      ...next,
      conditions: next.conditions.filter(segmentConditionIsComplete),
    })
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(flush, APPLY_DELAY_MS)
  }

  const openChange = (next: boolean) => {
    if (!next) flush()
    setOpen(next)
  }

  const clear = () => {
    if (timer.current) clearTimeout(timer.current)
    pending.current = null
    setDraft({ conditions: [] })
    onRules({ conditions: [] })
  }

  /** The rules as they stand, the waiting change included. */
  const latest = () => pending.current ?? rules
  const hasRules = rules.conditions.length > 0
  const saveNew = () => {
    const toSave = latest()
    if (!toSave.conditions.length) {
      showErrorToast("Pick a rule first, then save the list as a segment.")
      return
    }
    openChange(false)
    onSaveAsSegment(toSave)
  }

  const update = async () => {
    if (!openSegment) return
    await runUpdate(async () => {
      await saveSegment(openSegment.id, {
        name: openSegment.name,
        description: openSegment.description,
        kind: "rules",
        rules: cleanSegmentRules(rules),
      })
      setConfirmUpdate(false)
      toast.success(`${quoteOneLine(openSegment.name)} now holds these rules.`)
      await onUpdated()
    })
  }

  const rulesSegment = openSegment?.kind === "rules" ? openSegment : null
  const save = rulesSegment ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline">
          <BookmarkPlusIcon className="size-4" />
          Save
          <ChevronDownIcon className="size-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {segmentChanged ? (
          <DropdownMenuItem
            onSelect={() => {
              openChange(false)
              setConfirmUpdate(true)
            }}
          >
            <span className="truncate">Update {quoteOneLine(rulesSegment.name)}</span>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onSelect={saveNew}>Save as new segment</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ) : (
    <Button type="button" variant="outline" onClick={saveNew}>
      <BookmarkPlusIcon className="size-4" />
      {openSegment ? "Save as new segment" : "Save to segment"}
    </Button>
  )

  return (
    <>
      <FilterPopover
        count={rules.conditions.length}
        open={open}
        onOpenChange={openChange}
        onClear={clear}
        save={save}
        contentClassName="w-[min(30rem,calc(100vw-2rem))]"
      >
        <ScrollArea className="-mx-3 -mt-3" viewportClassName="max-h-[min(32rem,60vh)]">
          <div className="grid gap-3 p-3">
            <SegmentRuleBuilder
              conditions={draft.conditions}
              onChange={(conditions) => change({ ...draft, conditions })}
              match={segmentRulesMatch(draft)}
              onMatchChange={(match) =>
                change({ ...(match === "any" ? { match } : {}), conditions: draft.conditions })
              }
              options={options}
              idPrefix="contact-filter"
              title="Rules"
              description={
                hasRules
                  ? `${total.toLocaleString()} ${plural(total, "person", "people")} match right now.${searching ? " Search words are not saved, only the rules." : ""}`
                  : "Nothing is filtered, so the list is showing everybody."
              }
              emptyText="No rules yet, so the list shows every contact you have."
            />
          </div>
        </ScrollArea>
      </FilterPopover>
      <ConfirmDialog
        open={confirmUpdate}
        onOpenChange={setConfirmUpdate}
        title={rulesSegment ? `Update ${quoteOneLine(rulesSegment.name)}?` : "Update this segment?"}
        description={
          rulesSegment
            ? `It held ${rulesSegment.total.toLocaleString()} ${plural(rulesSegment.total, "person", "people")}. From now on it holds whoever these rules match${searching ? "" : `, ${total.toLocaleString()} right now`}, so every newsletter and automation sent to it from now on reaches different people.${searching ? " Search words are not saved, only the rules." : ""}`
            : ""
        }
        confirmLabel="Update segment"
        destructive={false}
        loading={updating}
        onConfirm={() => void update()}
      />
    </>
  )
}
