import * as React from "react"

/**
 * Asks again for the banners this person should see (Tyler, 9 Nov 2026: "The
 * announcement and tray notification doesnt show up until I refresh the
 * page"). `ShellLayout` holds the banners and provides it; the bell calls it
 * each time its live connection says something changed, before it counts,
 * because asking also writes any tray notice an announcement owes this
 * person. Its own context, not the shell runtime, because the bell is drawn by
 * the layout and importing the layout back from it would be a loop.
 */
export const AnnouncementRefreshContext = React.createContext<(() => Promise<void>) | null>(null)

export function useAnnouncementRefresh() {
  return React.useContext(AnnouncementRefreshContext)
}
