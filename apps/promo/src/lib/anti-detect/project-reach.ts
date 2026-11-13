/**
 * What one project's accounts use, so picking a project in the Anti Detect
 * dashboard's Projects block narrows each section to it (Tyler, 12 Nov
 * 2026, his answer: "Projects ... narrows Profiles, Racks' phones and Bans
 * to that project's accounts. Proxies show the ones its profiles use").
 *
 * - **Profiles:** the browser profiles its accounts sign in inside.
 * - **Phones and racks:** the phones its accounts run on, and the racks
 *   those phones are on.
 * - **Proxies:** the proxies those profiles and phones go out through.
 * - **Bans** carry their project themselves.
 */

export type ProjectReach = {
  profiles: ReadonlySet<string>
  phones: ReadonlySet<string>
  racks: ReadonlySet<string>
  proxies: ReadonlySet<string>
}

type Account = {
  project: { id: string } | null
  profile: { id: string } | null
  phone: { id: string } | null
}
type Profile = { id: string; proxy: { id: string } | null }
type Phone = { id: string; rackId: string | null; proxy: { id: string } | null }

export function projectReach(projectId: string, accounts: readonly Account[], profiles: readonly Profile[], phones: readonly Phone[]): ProjectReach {
  const profileIds = new Set<string>()
  const phoneIds = new Set<string>()
  for (const account of accounts) {
    if (account.project?.id !== projectId) continue
    if (account.profile) profileIds.add(account.profile.id)
    if (account.phone) phoneIds.add(account.phone.id)
  }
  const proxies = new Set<string>()
  const racks = new Set<string>()
  for (const profile of profiles) {
    if (profileIds.has(profile.id) && profile.proxy) proxies.add(profile.proxy.id)
  }
  for (const phone of phones) {
    if (!phoneIds.has(phone.id)) continue
    if (phone.proxy) proxies.add(phone.proxy.id)
    if (phone.rackId) racks.add(phone.rackId)
  }
  return { profiles: profileIds, phones: phoneIds, racks, proxies }
}
