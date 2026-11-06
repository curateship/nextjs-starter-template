import { AtSignIcon, BookOpenTextIcon, BriefcaseBusinessIcon, CameraIcon, MessagesSquareIcon, Music2Icon } from "lucide-react"

import type { Network } from "@/lib/social/networks"

/** A network's mark, the same size as the text beside it. Drawn before its card's name in the project's left column and before its name in the middle column's header. */
export function NetworkIcon({ network }: { network: Network }) {
  switch (network) {
    case "reddit":
      return <MessagesSquareIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    case "medium":
      return <BookOpenTextIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    case "x":
      return <AtSignIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    case "linkedin":
      return <BriefcaseBusinessIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    case "instagram":
      return <CameraIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    case "tiktok":
      return <Music2Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
  }
}
