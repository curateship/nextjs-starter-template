import type { IconKey } from "@/lib/custom-shell"

export type ScraperModule = {
  key: string
  name: string
  description: string
  href: string
  icon: IconKey
}

export const scraperModules: ScraperModule[] = []
