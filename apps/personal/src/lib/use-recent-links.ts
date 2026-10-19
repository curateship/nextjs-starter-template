import * as React from "react"

import { allLinks, type Menu } from "@/lib/menu"
import {
  addRecentLink,
  readRecentLinks,
  recentLinksIn,
  removeRecentLink,
  saveRecentLinks,
} from "@/lib/recent-links"

/**
 * The links for "Recent", oldest last. `activeId` is the menu link the open
 * screen belongs to; each time it changes to a link not yet in the list, that
 * link joins at the front. `remove` takes one out until it is opened again;
 * a reload on its screen counts as opening it.
 */
export function useRecentLinks(menu: Menu, activeId: string | null) {
  const [ids, setIds] = React.useState(readRecentLinks)
  const [seenId, setSeenId] = React.useState<string | null>(null)
  const links = allLinks(menu)
  if (activeId !== seenId) {
    setSeenId(activeId)
    if (activeId) {
      setIds((list) => addRecentLink(list, activeId, new Set(links.map((link) => link.id))))
    }
  }
  React.useEffect(() => saveRecentLinks(ids), [ids])
  const remove = React.useCallback((id: string) => {
    setIds((list) => removeRecentLink(list, id))
  }, [])
  return { links: recentLinksIn(links, ids), remove }
}
