import * as React from "react"
import { CheckIcon, CopyIcon, Loader2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { showDealCode } from "@/lib/api/promotions/public"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/** How long the Copy button says "Copied" before it reads Copy again. */
const COPIED_MS = 2_000

/**
 * The deal's code, behind a Show code button. The page never carries the
 * code: tapping asks the server for it, which is also what counts the tap.
 * Once it is shown, a Copy button sits beside it.
 */
export function ShowCode({ slug }: { slug: string }) {
  const [code, setCode] = React.useState<string | null>(null)
  const [asking, setAsking] = React.useState(false)
  const [copied, setCopied] = React.useState(false)

  React.useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), COPIED_MS)
    return () => window.clearTimeout(timer)
  }, [copied])

  async function reveal() {
    dismissErrorToast()
    setAsking(true)
    try {
      const shown = await showDealCode(slug)
      if (shown.code === null) showErrorToast(shown.problem)
      else setCode(shown.code)
    } catch {
      showErrorToast("The code could not be shown. Please try again.")
    } finally {
      setAsking(false)
    }
  }

  async function copy() {
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
    } catch {
      showErrorToast("The code could not be copied. Select it and copy it by hand.")
    }
  }

  if (code === null) {
    return (
      <div>
        <Button type="button" disabled={asking} onClick={() => void reveal()}>
          {asking ? <Loader2Icon className="animate-spin" /> : null}
          Show code
        </Button>
      </div>
    )
  }

  return (
    <div className="flex w-fit max-w-full flex-wrap items-center gap-3 rounded-md border px-4 py-3">
      <div className="grid min-w-0 gap-1">
        <span className="text-xs text-muted-foreground">Code</span>
        <span className="font-mono text-lg font-semibold break-all select-all">
          {code}
        </span>
      </div>
      <Button type="button" variant="outline" onClick={() => void copy()}>
        {copied ? <CheckIcon /> : <CopyIcon />}
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  )
}
