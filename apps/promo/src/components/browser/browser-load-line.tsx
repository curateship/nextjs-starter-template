import * as React from "react"
import { Link } from "@tanstack/react-router"

import { loadBrowserLoad, type BrowserLoad } from "@/lib/api/browser/settings"
import { loadWords } from "@/lib/browser/wording"

/** Docker's figures move by the second; a glance every half minute is enough. */
const REFRESH_MS = 30_000

/**
 * The line at the top of the Browser profiles dashboard: how many browsers are
 * open against the limit, and the memory they use.
 *
 * Read on its own rather than with the list, because asking Docker takes a
 * moment per browser and the list is read every two seconds while a browser
 * opens. `version` changes whenever a profile's browser does, so the line
 * catches up as soon as a browser opens or closes.
 */
export function BrowserLoadLine({ version }: { version: string }) {
  const [load, setLoad] = React.useState<BrowserLoad | null>(null)

  React.useEffect(() => {
    let live = true
    const read = () =>
      loadBrowserLoad().then(
        (next) => {
          if (live) setLoad(next)
        },
        // A line that cannot be read says nothing rather than something wrong.
        () => {}
      )
    void read()
    const timer = setInterval(() => void read(), REFRESH_MS)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [version])

  if (!load) return null

  return (
    <p className="text-sm text-muted-foreground">
      {loadWords(load)}{" "}
      <Link
        to="/admin/settings/$tab"
        params={{ tab: "browsers" }}
        className="font-medium text-foreground underline underline-offset-2"
      >
        Change the limit
      </Link>
    </p>
  )
}
