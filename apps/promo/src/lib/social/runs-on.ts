/**
 * Where an account runs, as the one string a Select holds: `profile:<id>` or
 * `phone:<id>`, because the two kinds share no ids. `NO_DEVICE` is "nothing",
 * which only Settings → Reddit account offers.
 */

export const NO_DEVICE = "none"

export type RunsOn = { profileId: string | null; phoneId: string | null }

export function runsOnValue(runsOn: RunsOn): string {
  if (runsOn.profileId) return `profile:${runsOn.profileId}`
  if (runsOn.phoneId) return `phone:${runsOn.phoneId}`
  return ""
}

export function readRunsOn(value: string): RunsOn {
  if (value.startsWith("profile:")) return { profileId: value.slice(8), phoneId: null }
  if (value.startsWith("phone:")) return { profileId: null, phoneId: value.slice(6) }
  return { profileId: null, phoneId: null }
}
