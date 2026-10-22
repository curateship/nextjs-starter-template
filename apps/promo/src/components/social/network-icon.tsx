import { BookOpenTextIcon, MessagesSquareIcon } from "lucide-react"

import type { Network } from "@/lib/social/networks"

/** A network's mark, the same size as the text beside it. Drawn on its row in the project's left column and before its name in the middle column's header. */
export function NetworkIcon({ network }: { network: Network }) {
  switch (network) {
    case "reddit":
      return <MessagesSquareIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    case "medium":
      return <BookOpenTextIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
  }
}
