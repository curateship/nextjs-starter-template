import { useNoteTicks } from "@/components/trade/note-ticks"
import { RuleNoteChecklist } from "@/components/trade/rule-note-checklist"
import { UnmetRulesPanel } from "@/components/trade/unmet-rules-panel"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { RuleNote, RuleResult } from "@/lib/trade/trading-rules"

/**
 * An entry held back by the person's own trading rules, until this window is
 * answered. `send` places it with the names of the rules it went against, for
 * the Journal; `goBack` sends nothing and puts the order window back.
 */
export type PendingEntry = {
  /** The coin it is for, whose note ticks the window shows. */
  marketKey: string
  /** The action and the size, "Short $500": the title and the send button. */
  action: string
  /** The rules that count against this entry. One that blocks means Go back only. */
  results: RuleResult[]
  /** The notes of every rule that covers this entry, each to be ticked first. */
  notes: RuleNote[]
  /** Rule names only when a Warn rule was confirmed past; never an empty list. */
  send: (overrode?: string[]) => void
  goBack: () => void
}

/**
 * The one window for every rule an entry runs into. Nothing has been sent or
 * drawn while it is open, and Go back leaves it that way.
 *
 * - A rule set to Block, and sure of every condition it needs, refuses the
 *   entry with only Go back. Changing that is a choice made in Settings, not
 *   in the moment.
 * - Otherwise each note still unticked is a box here, the same box as on the
 *   chart. A Block rule's notes must all be ticked before the send button
 *   appears. A Warn rule never stops the entry, its notes included: Tyler,
 *   15 Oct 2026, "the trading rule modal warn me but dont let me ignore it",
 *   then chose "Anyway skips notes too". Until then every note held it.
 * - A Warn rule's button repeats the action and the size with "anyway", so
 *   what is confirmed is the trade and not an abstract yes. Going past an
 *   unticked note names its rule in the Journal, the same as a broken one.
 */
export function EntryRulesWindow({
  entry,
  onClose,
}: {
  entry: PendingEntry | null
  onClose: () => void
}) {
  const ticked = useNoteTicks(entry?.marketKey ?? null)
  const blocked = entry?.results.some((result) => result.blocks) ?? false
  const notes = blocked ? [] : (entry?.notes ?? [])
  const unticked = notes.filter((note) => !ticked.has(note.key))
  const held = unticked.some((note) => note.holds)
  const warned = (entry?.results.length ?? 0) > 0 || unticked.length > 0

  const goBack = () => {
    if (!entry) return
    entry.goBack()
    onClose()
  }

  return (
    <Dialog
      open={entry !== null}
      onOpenChange={(open) => {
        if (!open) goBack()
      }}
    >
      {entry ? (
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>{`${entry.action}?`}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <DialogDescription>
              {blocked
                ? "Your rule blocks this entry, so nothing has been sent. Change the rule in Settings, Trading rules, to trade it."
                : held
                  ? "Tick every note of a blocking rule before this goes out. Nothing has been sent."
                  : unticked.length > 0
                    ? "Some notes are not ticked. Nothing has been sent, and you can still go ahead."
                    : "Nothing has been sent. Go back changes nothing."}
            </DialogDescription>
            {notes.length > 0 ? (
              <div className="grid gap-2 rounded-lg border p-3 text-sm">
                <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Your notes
                </p>
                <RuleNoteChecklist marketKey={entry.marketKey} notes={notes} />
              </div>
            ) : null}
            <UnmetRulesPanel results={entry.results} />
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={goBack}>
              Go back
            </Button>
            {!blocked && !held ? (
              <Button
                type="button"
                onClick={() => {
                  const sending = entry
                  const names = [
                    ...new Set([
                      ...sending.results.map((result) => result.rule.name),
                      ...unticked.map((note) => note.ruleName),
                    ]),
                  ]
                  onClose()
                  sending.send(names.length > 0 ? names : undefined)
                }}
              >
                {warned ? `${entry.action} anyway` : entry.action}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  )
}
