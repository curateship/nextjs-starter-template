/**
 * Plan features are free-form per product, but always JSON-safe scalars so they
 * survive the trip from the database to the browser unchanged.
 */
export type PlanFeatureValue = string | number | boolean | null

export type PlanFeatures = Record<string, PlanFeatureValue>

/**
 * How one feature key reads on a plan card.
 *
 * A key can carry more than one shape because an admin types this JSON by hand,
 * so each rule covers the value shape it knows and the rest falls through.
 */
type FeatureWording = {
  /** What a plain `true` says on its own: `sso: true` → "Single sign-on". */
  on?: string
  /** What a number counts: `seats: 10` → "10 seats". */
  count?: { one: string; many: string }
  /** What a word is a kind of: `support: "priority"` → "Priority support". */
  kindOf?: string
  /** What a monthly dollar amount buys: `aiDollars: 20` → "$20 of AI use a month". */
  dollarsAMonth?: string
}

/**
 * What each known feature key says on a plan card.
 *
 * A key that is not here still shows up — `describeFeature` falls back to
 * tidying the key itself, so a feature an admin adds today appears on the card
 * today instead of vanishing until someone ships wording for it. That fallback
 * is a guess though (`api_calls: 1000` becomes "1,000 api calls"), so a key
 * worth selling belongs in this map.
 */
const FEATURE_WORDING: Record<string, FeatureWording> = {
  seats: { count: { one: "seat", many: "seats" } },
  workspaces: { count: { one: "workspace", many: "workspaces" } },
  sso: { on: "Single sign-on" },
  support: { kindOf: "support" },
  aiDollars: { dollarsAMonth: "of AI use" },
}

/** Turns a plan's free-form features JSON into readable bullet points. */
export function describePlanFeatures(features: PlanFeatures) {
  return Object.entries(features)
    .filter(([, value]) => value !== false && value !== null && value !== "")
    .map(([key, value]) => describeFeature(key, value))
}

function describeFeature(key: string, value: PlanFeatureValue) {
  const wording = FEATURE_WORDING[key]

  if (wording) {
    if (typeof value === "number" && wording.count) {
      const noun = value === 1 ? wording.count.one : wording.count.many
      return `${formatCount(value)} ${noun}`
    }
    if (typeof value === "number" && wording.dollarsAMonth) {
      return `$${formatCount(value)} ${wording.dollarsAMonth} a month`
    }
    if (value === true && wording.on) return wording.on
    if (typeof value === "string" && wording.kindOf) {
      return `${capitalize(words(value))} ${wording.kindOf}`
    }
  }

  // An unknown key, or a known one carrying a value its wording has no rule
  // for. Say the key as plainly as it can be said rather than dropping it.
  const label = words(key)
  if (value === true) return capitalize(label)
  if (typeof value === "number") return `${formatCount(value)} ${label}`
  return `${capitalize(label)}: ${String(value)}`
}

/** `api_calls` / `apiCalls` → `api calls`. */
function words(value: string) {
  return value
    .replace(/[_-]/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
}

// Pinned to one locale like `formatMoney`: this renders on the server too, and
// a browser in another locale would otherwise disagree with it on hydration.
function formatCount(value: number) {
  return value.toLocaleString("en-US")
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}
