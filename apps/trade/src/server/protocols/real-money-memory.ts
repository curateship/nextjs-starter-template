/**
 * The short memory behind the real-money check, in its own file so the
 * check (`real-money.ts`) and the Settings write (`workers.ts`) can both
 * reach it without importing each other.
 *
 * Only a "yes" is ever remembered, and only for a moment. "Off" is never
 * cached, so switching trading ON is seen on the very next signature.
 * Switching it OFF forgets this memory inside `setRealMoneySwitch` itself,
 * so the process that took the click refuses immediately; the other
 * containers refuse when their two seconds run out. Before this, every
 * signature paid its own database read, and a multi-leg action paid several.
 */
const SWITCH_REMEMBER_MS = 2_000

let switchOnUntil = 0
// The memory belongs to the database it was read from. In the app that is
// always the same handle; in tests every case builds a fresh database, so a
// "yes" from one can never leak into the next.
let rememberedFor: unknown = null

export function realMoneyYesRemembered(database: unknown): boolean {
  return rememberedFor === database && Date.now() < switchOnUntil
}

export function rememberRealMoneyYes(database: unknown): void {
  rememberedFor = database
  switchOnUntil = Date.now() + SWITCH_REMEMBER_MS
}

export function forgetRealMoneySwitch(): void {
  rememberedFor = null
  switchOnUntil = 0
}
