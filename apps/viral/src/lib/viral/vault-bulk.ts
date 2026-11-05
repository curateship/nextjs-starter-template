import { describeBulkResult } from "@/lib/format/bulk-result"
import { plural } from "@/lib/format/plural"

/** The shape `changeVaultItemsFn` answers with. */
type VaultBulkAnswer = { completed: string[]; same: string[]; skipped: { id: string; reason: string }[] }

/**
 * What a mass change did, in one line: how many changed, how many were
 * already that way, and each one refused with its reason.
 */
export function describeVaultBulk(result: VaultBulkAnswer, verb: string) {
  const line = describeBulkResult({
    done: result.completed.length,
    kept: 0,
    same: result.same.length,
    one: "idea",
    many: "ideas",
    verb,
  })
  const reasons = new Map<string, number>()
  for (const skipped of result.skipped) reasons.set(skipped.reason, (reasons.get(skipped.reason) ?? 0) + 1)
  const refused = [...reasons].map(([reason, count]) => `${count} ${plural(count, "was", "were")} ${reason}.`)
  return [line, ...refused].join(" ")
}

