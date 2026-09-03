import { unknownPlanFields, type SmartOrderKind } from "@/lib/trade/smart-plan"

/** Rows already complained about, so the log says it once per row, not once a second. */
const noted = new Set<string>()

/**
 * True when a saved plan carries fields this build has never heard of, which
 * means a newer build wrote it and this one must not touch it.
 *
 * Used by both engine paths — the pass that works the plans and the pass that
 * reconciles their live orders — so an older engine standing in for a newer
 * one can neither trade the row nor save it back with the new fields gone.
 * That is what turned seven short grids into "buying grids holding a short"
 * on 3 Sep 2026 and ended them. The row waits, untouched, for a build that
 * understands it; the log says so once, naming the fields, so a stale
 * container is found instead of guessed at.
 */
export function leftForANewerBuild(
  rowId: string,
  kind: SmartOrderKind,
  plan: unknown
): boolean {
  const unknown = unknownPlanFields(kind, plan)
  if (unknown.length === 0) {
    noted.delete(rowId)
    return false
  }
  if (!noted.has(rowId)) {
    noted.add(rowId)
    console.warn(
      `trade: smart order ${rowId} (${kind}) was written by a newer build and is left alone by this one — unknown fields: ${unknown.join(", ")}`
    )
  }
  return true
}
