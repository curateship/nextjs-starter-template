import { ClapperboardIcon } from "lucide-react"

import type { VideoModule } from "@/video-modules/types"

export const moduleRegistry: VideoModule[] = [
  {
    key: "ugc-ad-video",
    name: "UGC Ad Video",
    description: "Create vertical short-form UGC ads from actor, product, script, and voice inputs.",
    provider: "Seedance",
    href: "/admin/modules/ugc-ad-video",
    createHref: "/admin/modules/ugc-ad-video/create",
    icon: ClapperboardIcon,
  },
]
