import type { IconKey } from "@/lib/custom-shell"
import { pageMetadataModule } from "@/modules/page-metadata/manifest"

export type ScraperModule = {
  key: string
  name: string
  description: string
  href: string
  icon: IconKey
}

export const scraperModules: ScraperModule[] = [pageMetadataModule]
