import type { AnyStrategyKindModule } from "./contract"
import { dcaKind } from "./dca"
import { signalKind } from "./signal"

/**
 * Every strategy kind the platform offers. TO ADD A KIND: create its card in
 * this directory, list it here, and register its engine in
 * worker/src/strategies/registry.ts — no screen needs editing.
 *
 * Order matters for config parsing: signal stays LAST because its `kind`
 * field is defaulted, so it must only catch configs no other kind claimed
 * (including legacy kind-less configs).
 */
export const STRATEGY_KINDS: readonly AnyStrategyKindModule[] = [
  dcaKind,
  signalKind,
]

export const STRATEGY_KIND_BY_ID: Record<string, AnyStrategyKindModule> =
  Object.fromEntries(STRATEGY_KINDS.map((kind) => [kind.kind, kind]))

/** The card that owns a dashboard type id (indicator id or kind id). */
export function kindForType(typeId: string): AnyStrategyKindModule | null {
  return (
    STRATEGY_KINDS.find((kind) => kind.typeIds().includes(typeId)) ?? null
  )
}
