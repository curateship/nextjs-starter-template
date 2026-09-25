import { z } from "zod"

import { KNOWN_PROTOCOLS, MARKET_CATEGORIES } from "@/lib/protocols/contracts"

export const EXPLORER_COLUMNS = [
  "pace",
  "longDaily",
  "shortDaily",
  "folders",
  "listed",
  "sparkline",
  "price",
  "change24h",
  "volume24hUsd",
  "fundingHourly",
  "maxLeverage",
  "move5s",
  "traded5s",
  "move1m",
  "traded1m",
  "move5m",
  "traded5m",
  "openInterestUsd",
] as const
export type ExplorerColumn = (typeof EXPLORER_COLUMNS)[number]
export const EXPLORER_LABELS: Record<ExplorerColumn, string> = {
  pace: "Pace",
  longDaily: "Long, $/day",
  shortDaily: "Short, $/day",
  folders: "Folders",
  listed: "Listed",
  sparkline: "5m line",
  price: "Price",
  change24h: "24h change",
  volume24hUsd: "24h volume",
  fundingHourly: "Funding / hour",
  maxLeverage: "Max leverage",
  move5s: "5s move",
  traded5s: "5s traded est.",
  move1m: "1m move",
  traded1m: "1m traded est.",
  move5m: "5m move",
  traded5m: "5m traded est.",
  openInterestUsd: "Open interest",
}
const amount = z.number().finite().min(0).max(1e15)
export const explorerViewSchema = z
  .object({
    minimumPace: amount.default(0),
    dailyFunding: z
      .enum([
        "any",
        "longEarns",
        "shortEarns",
        "longCostsUnder",
        "shortCostsUnder",
      ])
      .default("any"),
    maximumDailyCost: amount.default(0),
    onlyMine: z.boolean().default(false),
    folder: z.string().max(80).default(""),
    recentListings: z.boolean().default(false),
    hideQuiet: z.boolean().default(false),
    pins: z.array(z.string().max(200)).max(3000).default([]),
    layout: z.enum(["table", "map"]).default("table"),
    mapWindow: z.enum(["5s", "1m", "5m", "24h"]).default("1m"),
    arrivals: z.boolean().default(false),
    alertPace: amount.default(5),
    search: z.string().max(120),
    exchanges: z.array(z.enum(KNOWN_PROTOCOLS)).max(KNOWN_PROTOCOLS.length),
    categories: z
      .array(z.enum(MARKET_CATEGORIES))
      .max(MARKET_CATEGORIES.length),
    minimumVolume: amount,
    moveDirection: z.enum(["either", "up", "down"]),
    minimumMove: amount,
    funding: z.enum(["any", "paying", "costing", "cheap"]),
    minimumLeverage: amount,
    tradeable: z.enum(["any", "yes", "no"]),
    sort: z.enum(["market", ...EXPLORER_COLUMNS]),
    direction: z.enum(["asc", "desc"]),
    liveSort: z.boolean(),
    groupByCoin: z.boolean(),
    columns: z
      .array(z.enum(EXPLORER_COLUMNS))
      .max(EXPLORER_COLUMNS.length)
      .refine(
        (columns) => new Set(columns).size === columns.length,
        "Choose each column once."
      ),
  })
  .refine(
    (view) => view.sort === "market" || view.columns.includes(view.sort),
    "The sorted column must be visible."
  )
export type ExplorerView = z.infer<typeof explorerViewSchema>
export const DEFAULT_EXPLORER_VIEW: ExplorerView = {
  minimumPace: 0,
  dailyFunding: "any",
  maximumDailyCost: 0,
  onlyMine: false,
  folder: "",
  recentListings: false,
  hideQuiet: false,
  pins: [],
  layout: "table",
  mapWindow: "1m",
  arrivals: false,
  alertPace: 5,
  search: "",
  exchanges: [...KNOWN_PROTOCOLS],
  categories: [],
  minimumVolume: 0,
  moveDirection: "either",
  minimumMove: 0,
  funding: "any",
  minimumLeverage: 0,
  tradeable: "any",
  sort: "volume24hUsd",
  direction: "desc",
  liveSort: false,
  groupByCoin: false,
  columns: EXPLORER_COLUMNS.filter(
    (column) =>
      ![
        "openInterestUsd",
        "folders",
        "listed",
        "sparkline",
        "fundingHourly",
      ].includes(column)
  ),
}

export function clearExplorerFilters(view: ExplorerView): ExplorerView {
  const {
    search,
    exchanges,
    categories,
    minimumVolume,
    moveDirection,
    minimumMove,
    funding,
    minimumLeverage,
    tradeable,
  } = DEFAULT_EXPLORER_VIEW
  return {
    ...view,
    minimumPace: 0,
    dailyFunding: "any",
    maximumDailyCost: 0,
    onlyMine: false,
    folder: "",
    recentListings: false,
    hideQuiet: false,
    search,
    exchanges,
    categories,
    minimumVolume,
    moveDirection,
    minimumMove,
    funding,
    minimumLeverage,
    tradeable,
  }
}
export const explorerPrefsSchema = z
  .object({
    discoverySound: z.boolean().default(false),
    lastVisit: z.number().finite().min(0).default(0),
    current: explorerViewSchema,
    activeView: z.string().max(80),
    views: z
      .array(
        z.object({
          id: z.string().min(1).max(80),
          name: z.string().trim().min(1).max(40),
          view: explorerViewSchema,
        })
      )
      .max(20),
  })
  .refine(
    (prefs) =>
      new Set(prefs.views.map((view) => view.id)).size === prefs.views.length,
    "View ids must be unique."
  )
  .refine(
    (prefs) =>
      prefs.views.every((view) => view.id !== "all") &&
      (prefs.activeView === "all" ||
        prefs.views.some((view) => view.id === prefs.activeView)),
    "Choose an existing view."
  )
  .refine(
    (prefs) =>
      new Set(prefs.views.map((view) => view.name.toLowerCase())).size ===
      prefs.views.length,
    "View names must be unique."
  )
export type ExplorerPrefs = z.infer<typeof explorerPrefsSchema>
export function defaultExplorerPrefs(): ExplorerPrefs {
  return {
    discoverySound: false,
    lastVisit: 0,
    current: { ...DEFAULT_EXPLORER_VIEW },
    activeView: "all",
    views: [
      {
        id: "moved",
        name: "Just moved",
        view: { ...DEFAULT_EXPLORER_VIEW, sort: "traded5s", liveSort: true },
      },
      {
        id: "cheap",
        name: "Big and cheap to hold",
        view: {
          ...DEFAULT_EXPLORER_VIEW,
          minimumVolume: 100_000_000,
          funding: "cheap",
        },
      },
      {
        id: "test",
        name: "Test only",
        view: { ...DEFAULT_EXPLORER_VIEW, tradeable: "no" },
      },
    ],
  }
}
