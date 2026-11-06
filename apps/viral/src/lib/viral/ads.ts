import type { WriterPrice } from "@/lib/viral/writers"

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

/**
 * The lengths Meta shows before it cuts an ad's text off (task part 10). The
 * writer aims at them; a written ad that runs over is kept, never refused.
 */
export const AD_COPY_AIMS = { mainText: 125, headline: 40, description: 30 } as const

/** An ad written from a Winning ad for the project's topic, in Meta's three boxes (Tyler: "Meta's three boxes"). */
export type AdCopy = { id: string; mainText: string; headline: string; description: string; createdAt: string }

/** The ads written from one Winning ad, newest first, and what the next costs. */
export type AdCopies = { copies: AdCopy[]; price: WriterPrice }

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
