import { MapPinnedIcon } from "lucide-react"

import type { ScraperModule } from "@/scrapers/types"

export const scraperModules: ScraperModule[] = [
  {
    key: "google-maps",
    name: "Google Maps",
    href: "/admin/scrapers/google-maps",
    icon: MapPinnedIcon,
  },
]
