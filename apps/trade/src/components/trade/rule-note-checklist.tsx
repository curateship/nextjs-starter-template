import * as React from "react"

import { setNoteTick, useNoteTicks } from "@/components/trade/note-ticks"
import { Checkbox } from "@/components/ui/checkbox"
import type { RuleNote } from "@/lib/trade/trading-rules"
import { cn } from "@/lib/utils"

/**
 * A rule's notes as boxes to tick, grouped under each rule's name. The chart's
 * Rules box and the window before an entry both draw it, and both tick the
 * same boxes for the coin on screen.
 */
export function RuleNoteChecklist({
  marketKey,
  notes,
  showRuleNames = true,
  className,
}: {
  marketKey: string
  notes: readonly RuleNote[]
  /** Off where the rule's name is already the heading above the list. */
  showRuleNames?: boolean
  className?: string
}) {
  const ticked = useNoteTicks(marketKey)
  const idPrefix = React.useId()
  const groups: { ruleId: string; ruleName: string; notes: RuleNote[] }[] = []
  for (const note of notes) {
    const last = groups[groups.length - 1]
    if (last?.ruleId === note.ruleId) last.notes.push(note)
    else groups.push({ ruleId: note.ruleId, ruleName: note.ruleName, notes: [note] })
  }
  if (groups.length === 0) return null
  return (
    <div className={cn("grid gap-2", className)}>
      {groups.map((group) => (
        <fieldset key={group.ruleId} className="grid gap-1.5">
          <legend
            className={showRuleNames ? "mb-1 font-medium" : "sr-only"}
          >
            {group.ruleName}
          </legend>
          {group.notes.map((note, index) => {
            const id = `${idPrefix}-${group.ruleId}-${index}`
            return (
              <div key={note.key} className="flex items-start gap-2">
                <Checkbox
                  id={id}
                  className="mt-0.5"
                  checked={ticked.has(note.key)}
                  onCheckedChange={(on) =>
                    setNoteTick(marketKey, note.key, on === true)
                  }
                />
                <label
                  htmlFor={id}
                  className={cn(
                    "min-w-0 break-words",
                    ticked.has(note.key) && "text-muted-foreground line-through"
                  )}
                >
                  {note.text}
                </label>
              </div>
            )
          })}
        </fieldset>
      ))}
    </div>
  )
}
