/**
 * Turns the line a browser uses to introduce itself into something a person
 * recognises, like "Chrome on macOS".
 *
 * Deliberately small and deliberately approximate. This exists so somebody can
 * spot the session that is not theirs in a list of three or four, not to
 * identify a browser exactly — a wrong guess here costs a slightly odd label,
 * nothing more. The raw line is what gets stored, so this can be improved later
 * without asking anybody to sign in again.
 */

const UNKNOWN_DEVICE = "Unknown device"

// Order matters: Edge and Opera both still call themselves Chrome, and Chrome
// still calls itself Safari, so the more specific name has to be tried first.
const BROWSERS: [name: string, marker: string][] = [
  ["Edge", "Edg/"],
  ["Opera", "OPR/"],
  ["Samsung Internet", "SamsungBrowser/"],
  ["Firefox", "Firefox/"],
  ["Chrome", "Chrome/"],
  ["Safari", "Safari/"],
]

const PLATFORMS: [name: string, marker: string][] = [
  ["iPhone", "iPhone"],
  ["iPad", "iPad"],
  ["Android", "Android"],
  ["Windows", "Windows"],
  ["macOS", "Mac OS X"],
  ["Linux", "Linux"],
]

function findName(userAgent: string, table: [string, string][]) {
  return table.find(([, marker]) => userAgent.includes(marker))?.[0] ?? null
}

export function describeDevice(userAgent: string | null) {
  if (!userAgent) {
    return UNKNOWN_DEVICE
  }

  const browser = findName(userAgent, BROWSERS)
  const platform = findName(userAgent, PLATFORMS)

  if (browser && platform) {
    return `${browser} on ${platform}`
  }

  return browser ?? platform ?? UNKNOWN_DEVICE
}
