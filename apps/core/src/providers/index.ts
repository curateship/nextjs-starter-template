import { MapPinnedIcon } from "lucide-react"

import type { ProviderModule } from "@/providers/types"

export const providers: ProviderModule[] = [
  {
    key: "google-maps",
    name: "Google Maps",
    href: "/admin/providers/google-maps",
    icon: MapPinnedIcon,
  },
]
