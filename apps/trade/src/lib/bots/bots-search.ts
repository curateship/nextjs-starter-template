import { readOpenSearch } from "@/lib/hooks/use-open-from-link"
import { readOneOf, readSearchText } from "@/lib/nav/list-search"

/**
 * The Bots dashboard's address (Tyler, 9 Nov 2026: Recipes, Backtests and
 * Bots in "one 3 panel dashboard like in shell").
 *
 * - `?view=` is the row picked in the left page's Dashboards block:
 *   Overview, Recipes, Backtests or Bots. It is always written once a row is
 *   picked, because a bare `/bots` goes back to the place last open.
 * - `?open=` is the line picked in the middle table, shown on the right.
 * - `?full=1` opens that line in the middle: a recipe's canvas, or a
 *   backtest's or bot's chart over its trades. Back closes it again.
 * - `?coin=` is the coin on an opened run's chart, a full market key.
 * - `?node=` is the step picked on an opened recipe's canvas.
 * - `?q=` is the table's search, and `?archived=1` shows archived backtests.
 * - `?recipe=` shows only the backtests one recipe ran, by the recipe's id
 *   (the Backtests table's Filter → Recipe).
 *
 * Every other key belongs to one section, so picking a row of the
 * Dashboards block starts the address again with that row alone.
 */
export const BOTS_VIEWS = ["overview", "recipes", "backtests", "bots"] as const
export type BotsView = (typeof BOTS_VIEWS)[number]

export const BOTS_VIEW_LABELS: Record<BotsView, string> = {
  overview: "Overview",
  recipes: "Recipes",
  backtests: "Backtests",
  bots: "Bots",
}

export type BotsSearch = {
  /** Overview when absent. */
  view?: BotsView
  open?: string
  full?: true
  coin?: string
  node?: string
  q?: string
  archived?: true
  recipe?: string
}

/** A market key or a step id: short text, or nothing. */
function readShortText(value: unknown, longest: number) {
  return typeof value === "string" && value.length > 0 && value.length <= longest ? value : undefined
}

/** `1`, as the address writes it, or `true`, as the router hands it back. */
function readFlag(value: unknown): true | undefined {
  return value === true || value === 1 || value === "1" || value === "true" ? true : undefined
}

/** Every value is checked before use; a key the open section does not own is dropped. */
export function readBotsSearch(search: Record<string, unknown>): BotsSearch {
  const view = readOneOf(search.view, BOTS_VIEWS)
  if (!view || view === "overview") return { view }
  const { open } = readOpenSearch(search)
  const full = open ? readFlag(search.full) : undefined
  return {
    view,
    open,
    full,
    // A coin only means something on an opened run, a step on an opened recipe.
    coin: full && view !== "recipes" ? readShortText(search.coin, 120) : undefined,
    node: full && view === "recipes" ? readShortText(search.node, 60) : undefined,
    q: readSearchText(search.q),
    archived: view === "backtests" ? readFlag(search.archived) : undefined,
    recipe: view === "backtests" ? readShortText(search.recipe, 80) : undefined,
  }
}

export function botsViewOf(search: BotsSearch): BotsView {
  return search.view ?? "overview"
}

/** The address for a row picked in the Dashboards block: that row alone. */
export function botsViewSearch(view: BotsView): BotsSearch {
  return { view }
}

/** The address that opens one record in the middle. */
export function botsRecordSearch(view: Exclude<BotsView, "overview">, id: string): BotsSearch {
  return { view, open: id, full: true }
}

/**
 * The same address as text, for a link that is stored rather than followed
 * at once: a notice's link, which the bell opens later.
 */
export function botsRecordHref(view: Exclude<BotsView, "overview">, id: string) {
  return `/bots?view=${view}&open=${encodeURIComponent(id)}&full=1`
}
