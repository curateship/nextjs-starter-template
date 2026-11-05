/**
 * Winning ads (`workspace/docs/winning-ads.md`, task part 23). Tyler, 4 Nov
 * 2026: "Meta's ad library". An ad still running after this many days is
 * one somebody keeps paying for, so it is making them money.
 */
export const WINNING_AD_DAYS = 30

/** The countries the ad library is asked about. Meta only lists everyday ads that reached the EU or the UK. */
export const AD_COUNTRIES = ["GB", "IE"] as const

/** How many of the project's keywords one search asks about, and how many ads each. */
export const AD_KEYWORDS_PER_SEARCH = 5
export const ADS_PER_KEYWORD = 50

export type WinningAd = {
  id: string
  adArchiveId: string
  pageName: string
  body: string
  title: string
  keyword: string
  platforms: string[]
  startedAt: string
  daysRunning: number
  /** Meta's public page for the ad, which shows its picture or video. */
  libraryUrl: string
}

export type ProjectAds = {
  ads: WinningAd[]
  searchedAt: string | null
  error: string | null
  /** False until a token is pasted on Settings → Meta. */
  tokenSet: boolean
}

/** Whole days between two moments, never below 0. */
export function daysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)))
}

export function adLibraryUrl(adArchiveId: string): string {
  return `https://www.facebook.com/ads/library/?id=${encodeURIComponent(adArchiveId)}`
}

/** "Facebook, Instagram", the way Meta's platform names read on screen. */
export function platformNames(platforms: string[]): string {
  return platforms
    .map((one) => one.toLowerCase())
    .map((one) => (one === "facebook" ? "Facebook" : one === "instagram" ? "Instagram" : one === "messenger" ? "Messenger" : one === "audience_network" ? "Audience Network" : one))
    .join(", ")
}
